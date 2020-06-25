

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
const morgan = require('morgan');

const { schema: { schema: SCHEMA_DEFN } } = require('@bcgsc/knowledgebase-schema');

const { logger, morganFormatter, fetchRoutes } = require('./repo/logging');
const {
    checkToken,
} = require('./middleware/auth'); // WARNING: middleware fails if function is not imported by itself
const { connectDB } = require('./repo');
const { getLoadVersion } = require('./repo/migrate/version');
const extensionsRouter = require('./extensions');
const { router: tokenRouter } = require('./routes/auth');
const errorHandler = require('./middleware/error');
const parseRouter = require('./routes/parse');
const statsRouter = require('./routes/stats');
const resourceRouter = require('./routes/resource');
const queryRouter = require('./routes/query');
const eulaRouter = require('./routes/eula');
const specRouter = require('./routes/openapi');
const { generateSwaggerSpec } = require('./routes/openapi/spec');
const config = require('./config');

// https://medium.com/@onufrienkos/keep-alive-connection-on-inter-service-http-requests-3f2de73ffa1
http.globalAgent.keepAlive = true;


const BOOLEAN_FLAGS = [
    'GKB_USER_CREATE',
    'GKB_DB_CREATE',
    'GKB_DISABLE_AUTH',
    'GKB_DB_MIGRATE',
];


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


/**
 * @typedef {express.Request} GraphKBRequest
 * request object with additional properties attached by middleware
 *
 * @property {orientjs.ConnectionPool} dbPool the orientdb database connection pool
 * @property {User} user the user record for the user making the request
 * @property {Object} conf the config options for this server
 * @property {bool} conf.GKB_DISABLE_AUTH disable auth flag
 * @property {bool} conf.GKB_KEYCLOAK_KEY content of the key file used for decoding keycloak tokens
 * @property {bool} conf.GKB_KEYCLOAK_ROLE role to expect the keycloak user to have
 * @property {bool} conf.GKB_KEY content of the key file used for generating tokens
 * @property {function} reconnectDb async function to be called on db connection errors
 */


class AppServer {
    /**
     * @property {express} app the express app instance
     * @property {?http.Server} server server the http server running the API
     * @property {?orientjs.Db} db the orientjs database connection
     * @property {express.Router} router the main router
     * @property {string} prefix the prefix to use for all routes
     * @property {Object} conf the configuration object
     */
    constructor(conf = createConfig()) {
        this.app = express();
        this.app.use(morgan(morganFormatter, { stream: logger.stream }));
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
        const { dbPool } = await connectDB(this.conf);
        this.dbPool = dbPool;
    }

    /**
     * Connect to the database, start the API server, and set dynamically built routes
     */
    async listen() {
        // connect to the database
        if (!this.dbPool) {
            await this.connectToDb();
        }
        const {
            GKB_KEY_FILE,
            GKB_DB_NAME,
            GKB_DISABLE_AUTH,
            GKB_KEYCLOAK_KEY_FILE,
        } = this.conf;


        // set up the swagger docs
        this.router.use((req, res, next) => {
            req.spec = generateSwaggerSpec(SCHEMA_DEFN, { host: this.host, port: this.port });
            req.dbPool = this.dbPool;
            req.conf = this.conf;
            req.reconnectDb = async () => this.connectToDb();
            return next();
        });
        this.router.use('/', specRouter);

        this.router.get('/schema', async (req, res) => {
            res.status(HTTP_STATUS.OK).json({ schema: jc.decycle(SCHEMA_DEFN) });
        });
        this.router.get('/version', async (req, res) => {
            res.status(HTTP_STATUS.OK).json({
                api: process.env.npm_package_version,
                db: GKB_DB_NAME,
                schema: getLoadVersion().version,
            });
        });
        this.router.use('/parse', parseRouter);

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
        this.router.use('/token', tokenRouter);

        this.router.use(checkToken(this.conf.GKB_KEY));
        // must be before the query/data routes to ensure unsigned users cannot access data
        this.router.use('/', eulaRouter);
        this.router.use('/query', queryRouter);
        this.router.use('/stats', statsRouter);

        // add the resource routes
        this.router.use('/', resourceRouter);
        this.router.use('/extensions', extensionsRouter);
        this.router.use(errorHandler);
        logger.log('info', 'Adding 404 capture');
        // last catch any errors for undefined routes. all actual routes should be defined above
        this.app.use((req, res) => res.status(HTTP_STATUS.NOT_FOUND).json({
            error: `Not Found: ${req.route}`,
            message: `The requested url does not exist: ${req.url}`,
            method: req.method,
            name: 'UrlNotFound',
            url: req.url,
        }));

        // log the registered routes
        const routes = fetchRoutes(this.router)
            .sort((r1, r2) => r1.path.localeCompare(r2.path));

        for (const { methods, path } of routes) {
            logger.info(`Registered route: (${Object.keys(methods).sort().join('|')}) ${path}`);
        }

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
            if (this.dbPool) {
                logger.info('closing the database pool');
                await this.dbPool.close();
            }
        } catch (err) {
            logger.error(err);
        }

        try {
            if (this.server) {
                logger.info('closing the database server connection');
                await this.server.close();
            }
        } catch (err) {
            logger.error(err);
        }
    }
}

module.exports = { AppServer, createConfig };
