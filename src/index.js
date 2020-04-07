

// required packages
const express = require('express');
const compression = require('compression');
const bodyParser = require('body-parser');
const fs = require('fs');
const http = require('http');
const jc = require('json-cycle');
const cors = require('cors');
const HTTP_STATUS = require('http-status-codes');
const { getPortPromise } = require('portfinder');

const { logger } = require('./repo/logging');
const {
    checkToken,
} = require('./middleware/auth'); // WARNING: middleware fails if function is not imported by itself
const { connectDB } = require('./repo');
const { getLoadVersion } = require('./repo/migrate/version');
const { addExtensionRoutes } = require('./extensions');
const { generateSwaggerSpec, registerSpecEndpoints } = require('./routes/openapi');
const { addResourceRoutes } = require('./routes/resource');
const { addPostToken } = require('./routes/auth');
const {
    addStatsRoute, addParserRoute, addQueryRoute, addErrorRoute,
} = require('./routes');
const config = require('./config');

const BOOLEAN_FLAGS = [
    'GKB_USER_CREATE',
    'GKB_DB_CREATE',
    'GKB_DISABLE_AUTH',
    'GKB_DB_MIGRATE',
];

const logRequests = (req, res, next) => {
    logger.log('info', `[${req.method}] ${req.url}`);
    return next();
};


const createConfig = (overrides = {}) => {
    const ENV = {
        GKB_HOST: process.env.HOSTNAME,
        ...config.common,
        ...config[process.env.NODE_ENV] || {},
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
     * @property {?http.Server} server server the http server running the API
     * @property {?orientjs.Db} db the orientjs database connection
     * @property {express.Router} router the main router
     * @property {string} prefix the prefix to use for all routes
     * @property {Object} conf the configuration object
     * @property {?Object.<string,ClassModel>} schema the mapping of class names to models for the db
     */
    constructor(conf = createConfig()) {
        this.app = express();
        this.app.use(logRequests);
        // set up middleware parser to deal with jsons
        this.app.use(bodyParser.urlencoded({ extended: true }));
        this.app.use(bodyParser.json());
        this.app.use(compression());
        // add some basic logging
        const originWhiteList = (conf.GKB_CORS_ORIGIN || '.*').split(/[\s,]+/g).map((patt) => {
            if (patt.startsWith('^') && patt.endsWith('$')) {
                return new RegExp(patt);
            }
            return patt;
        });
        this.app.use(cors({
            origin: originWhiteList,
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

    async connectToDb() {
        // connect to the database
        const {
            GKB_DB_HOST,
            GKB_DB_PORT,
        } = this.conf;

        logger.log('info', `starting db connection (${GKB_DB_HOST}:${GKB_DB_PORT})`);
        const { pool, schema } = await connectDB(this.conf);
        this.pool = pool;
        this.schema = schema;
    }

    /**
     * Connect to the database, start the API server, and set dynamically built routes
     */
    async listen() {
        // connect to the database
        if (!this.pool) {
            await this.connectToDb();
        }
        const {
            GKB_KEY_FILE,
            GKB_DB_NAME,
            GKB_DISABLE_AUTH,
            GKB_KEYCLOAK_KEY_FILE,
        } = this.conf;


        // set up the swagger docs
        this.spec = generateSwaggerSpec(this.schema, { port: this.port, host: this.host });
        registerSpecEndpoints(this.router, this.spec);

        this.router.get('/schema', async (req, res) => {
            res.status(HTTP_STATUS.OK).json({ schema: jc.decycle(this.schema) });
        });
        this.router.get('/version', async (req, res) => {
            res.status(HTTP_STATUS.OK).json({
                api: process.env.npm_package_version,
                db: GKB_DB_NAME,
                schema: getLoadVersion().version,
            });
        });
        addParserRoute(this); // doesn't require any data access so no auth required

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
        addPostToken(this);

        this.router.use(checkToken(this.conf.GKB_KEY));

        addQueryRoute(this);
        addStatsRoute(this);

        // simple routes
        for (const model of Object.values(this.schema)) {
            addResourceRoutes(this, model);
        }
        addExtensionRoutes(this);

        // catch any other errors
        addErrorRoute(this);
        logger.log('info', 'Adding 404 capture');
        // last catch any errors for undefined routes. all actual routes should be defined above
        this.app.use((req, res) => res.status(HTTP_STATUS.NOT_FOUND).json({
            error: `Not Found: ${req.route}`,
            name: 'UrlNotFound',
            message: `The requested url does not exist: ${req.url}`,
            url: req.url,
            method: req.method,
        }));

        if (!this.port) {
            logger.log('info', 'finding an available port');
            this.port = await getPortPromise();
        }
        this.server = http.createServer(this.app).listen(this.port, this.host);
        logger.log('info', `started application server (${this.host}:${this.port})`);
    }

    async close() {
        logger.info('cleaning up');

        try {
            if (this.pool) {
                logger.error('closing the database pool');
                await this.pool.close();
            }
        } catch (err) {
            logger.error(err);
        }

        try {
            if (this.server) {
                logger.error('closing the database server connection');
                await this.server.close();
            }
        } catch (err) {
            logger.error(err);
        }
    }
}

module.exports = { AppServer, createConfig };
