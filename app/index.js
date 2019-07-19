

// required packages
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const http = require('http');
const jc = require('json-cycle');
const cors = require('cors');
const HTTP_STATUS = require('http-status-codes');
const {getPortPromise} = require('portfinder');

const {logger} = require('./repo/logging');
const {selectCounts} = require('./repo/commands');
const {AttributeError} = require('./repo/error');
const {
    checkToken
} = require('./middleware/auth'); // WARNING: middleware fails if function is not imported by itself

const {connectDB} = require('./repo');
const {getLoadVersion} = require('./repo/migrate/version');

const {generateSwaggerSpec, registerSpecEndpoints} = require('./routes/openapi');
const {addResourceRoutes} = require('./routes/resource');
const {addPostToken} = require('./routes/auth');
const {addKeywordSearchRoute, addGetRecordsByList, addStatsRoute} = require('./routes');
const config = require('./config');

const BOOLEAN_FLAGS = [
    'GKB_USER_CREATE',
    'GKB_DB_CREATE',
    'GKB_DISABLE_AUTH',
    'GKB_DB_MIGRATE'
];

const logRequests = (req, res, next) => {
    logger.log('info', `[${req.method}] ${req.url}`);
    return next();
};


const createConfig = (overrides = {}) => {
    const ENV = {
        GKB_HOST: process.env.HOSTNAME,
        ...config.common,
        ...config[process.env.NODE_ENV] || {}
    };
    for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith('GKB_')) {
            ENV[key] = value;
        }
    }
    Object.assign(ENV, overrides);

    for (const flag of BOOLEAN_FLAGS) {
        if (typeof ENV[flag] === 'string') {
            if (['0', 'f', 'false'].includes(ENV[flag].toLowerCase().trim())) {
                ENV[flag] = false;
            } else {
                ENV[flag] = true;
            }
        } else {
            ENV[flag] = Boolean(ENV[flag]);
        }
    }

    return ENV;
};

class AppServer {
    /**
     * @property {express} app the express app instance
     * @property {?http.Server} server the http server running the API
     * @property {?orientjs.Db} the orientjs database connection
     * @property {express.Router} router the main router
     * @property {string} prefix the prefix to use for all routes
     * @property {Object} conf the configuration object
     * @property {?Object.<string,ClassModel>} schema the mapping of class names to models for the db
     */
    constructor(conf = createConfig()) {
        this.app = express();
        this.app.use(logRequests);
        // set up middleware parser to deal with jsons
        this.app.use(bodyParser.urlencoded({extended: true}));
        this.app.use(bodyParser.json());
        // add some basic logging
        this.app.use(cors({
            origin: true
        }));

        this.db = null;
        this.schema = null;
        this.server = null;
        this.conf = conf;

        // app server info
        this.host = conf.GKB_HOST;
        this.port = conf.GKB_PORT;

        // set up the routes
        this.router = express.Router();
        this.prefix = '/api';
        this.app.use(this.prefix, this.router);

        if (conf.GKB_LOG_LEVEL) {
            logger.transports.forEach((transport) => {
                transport.level = conf.GKB_LOG_LEVEL;
            });
        }
    }

    get url() {
        return `http://${this.host}:${this.port}${this.prefix}`;
    }

    /**
     * Connect to the database, start the API server, and set dynamically built routes
     */
    async listen() {
        // connect to the database
        const {
            GKB_DB_HOST,
            GKB_DB_PORT,
            GKB_KEY_FILE,
            GKB_DB_NAME,
            GKB_DISABLE_AUTH,
            GKB_KEYCLOAK_KEY_FILE
        } = this.conf;

        logger.log('info', `starting db connection (${GKB_DB_HOST}:${GKB_DB_PORT})`);
        const {db, schema} = await connectDB(this.conf);
        this.db = db;
        this.schema = schema;
        // set up the swagger docs
        this.spec = generateSwaggerSpec(schema, {port: this.port, host: this.host});
        registerSpecEndpoints(this.router, this.spec);

        this.router.get('/schema', async (req, res) => {
            res.status(HTTP_STATUS.OK).json({schema: jc.decycle(schema)});
        });
        this.router.get('/version', async (req, res) => {
            res.status(HTTP_STATUS.OK).json({
                api: process.env.npm_package_version,
                db: GKB_DB_NAME,
                schema: getLoadVersion().version
            });
        });
        // read the key file if it wasn't already set
        if (!this.conf.GKB_KEY) {
            logger.log('info', `reading the private key file: ${GKB_KEY_FILE}`);
            this.conf.GKB_KEY = fs.readFileSync(GKB_KEY_FILE);
        }
        // if external auth is enabled, read the keycloak public key file for verifying the tokens
        if (!GKB_DISABLE_AUTH && GKB_KEYCLOAK_KEY_FILE && !this.conf.GKB_KEYCLOAK_KEY) {
            logger.log('info', `reading the keycloak public key file: ${GKB_KEYCLOAK_KEY_FILE}`);
            this.conf.GKB_KEYCLOAK_KEY = fs.readFileSync(GKB_KEYCLOAK_KEY_FILE);
        }
        // add the addPostToken
        addPostToken({router: this.router, db, config: this.conf});

        this.router.use(checkToken(this.conf.GKB_KEY));

        addKeywordSearchRoute({router: this.router, db, config: this.conf});
        addGetRecordsByList({router: this.router, db, config: this.conf});
        addStatsRoute({router: this.router, db});
        // simple routes
        for (const model of Object.values(schema)) {
            addResourceRoutes({
                router: this.router, model, db, schema
            });
        }

        logger.log('info', 'Adding 404 capture');
        // catch any other errors
        this.router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
            logger.log('error', err.stack);
            return res.status(err.code || HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
        });
        // last catch any errors for undefined routes. all actual routes should be defined above
        this.app.use((req, res) => res.status(HTTP_STATUS.NOT_FOUND).json({
            error: `Not Found: ${req.route}`,
            name: 'UrlNotFound',
            message: `The requested url does not exist: ${req.url}`,
            url: req.url,
            method: req.method
        }));

        if (!this.port) {
            logger.log('info', 'finding an available port');
            this.port = await getPortPromise();
        }
        this.server = http.createServer(this.app).listen(this.port, this.host);
        logger.log('info', `started application server (${this.host}:${this.port})`);
    }

    async close() {
        logger.log('info', 'cleaning up');
        try {
            if (this.server) {
                await this.server.close();
            }
        } catch (err) {
            logger.log('error', err);
        }
        try {
            if (this.db) {
                await this.db.close();
            }
        } catch (err) {
            logger.log('error', err);
        }
    }
}

module.exports = {AppServer, createConfig};
