// required packages
import express from 'express';
import compression from 'compression';
import bodyParser from 'body-parser';
import fs from 'fs';
import http from 'http';
import jc from 'json-cycle';
import cors from 'cors';
import HTTP_STATUS from 'http-status-codes';
import { getPortPromise } from 'portfinder';
import morgan from 'morgan';
import path from 'path';
import orientjs from 'orientjs';
import {schema} from '@bcgsc-pori/graphkb-schema';

import { logger, morganFormatter } from './repo/logging';
import {
    checkToken,
}from './middleware/auth'; // WARNING: middleware fails if function is not imported by itself
import { connectDB } from './repo';
import { getLoadVersion } from './repo/migrate/version';
import { addExtensionRoutes } from './extensions';
import { generateSwaggerSpec, registerSpecEndpoints } from './routes/openapi';
import { addResourceRoutes } from './routes/resource';
import { addPostToken } from './routes/auth';
import { addEulaRoutes } from './routes/eula';
import {
    addStatsRoute, addParserRoute, addQueryRoute, addErrorRoute,
} from './routes';
import config from './config';
import {AppServerType, ConfigType} from './types';
import { OpenApiSpec } from './routes/openapi/types';

// https://github.com/nodejs/node-v0.x-archive/issues/9075
// supports diff node versions if present, will not have correct types
// @ts-ignore
http.globalAgent.keepAlive = true;
// @ts-ignore
http.globalAgent.options.keepAlive = true;

const BOOLEAN_FLAGS = [
    'GKB_USER_CREATE',
    'GKB_DB_CREATE',
    'GKB_DISABLE_AUTH',
    'GKB_DB_MIGRATE',
];

const createConfig = (overrides: Partial<ConfigType> = {}): ConfigType => {
    const ENV = {
        GKB_HOST: process.env.HOSTNAME || '0.0.0.0',
        ...config.common,
        ...config[process.env.NODE_ENV as string] || {},
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

class AppServer implements AppServerType {
    app: express.Express;
    db: orientjs.Server | null;
    server: http.Server | null;
    conf: ConfigType;
    router: express.Router;
    prefix: string;
    host: string;
    port: number | string;
    pool?: orientjs.Db;
    spec?: OpenApiSpec;

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
        this.app.use(morgan(morganFormatter, { stream: logger.stream }));
        // set up middleware parser to deal with jsons
        this.app.use(bodyParser.urlencoded({ extended: true }));
        this.app.use(bodyParser.json());
        this.app.use(compression());
        this.app.use(`${conf.GKB_BASE_PATH || ''}/public`, express.static(path.join(__dirname, 'static')));

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

        // read the key file(s) if it wasn't already set
        this.conf = {
            ...conf,
            GKB_KEY: conf.GKB_KEY || fs.readFileSync(conf.GKB_KEY_FILE).toString(),
            GKB_KEYCLOAK_KEY: conf.GKB_KEYCLOAK_KEY || fs.readFileSync(conf.GKB_KEYCLOAK_KEY_FILE).toString(),
        };

        // app server info
        this.host = conf.GKB_HOST;
        this.port = conf.GKB_PORT;

        // set up the routes
        this.router = express.Router();
        this.prefix = `${conf.GKB_BASE_PATH || ''}/api`;
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

    async connectToDb(opt = {}) {
        // connect to the database
        const {
            GKB_DB_HOST,
            GKB_DB_PORT,
        } = this.conf;

        logger.log('info', `starting db connection (${GKB_DB_HOST}:${GKB_DB_PORT})`);
        const { pool, schema } = await connectDB({ ...this.conf, ...opt });
        this.pool = pool;
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
            GKB_DB_NAME,
        } = this.conf;

        // set up the swagger docs
        this.spec = generateSwaggerSpec(schema, { host: this.host, port: this.port });
        registerSpecEndpoints(this.router, this.spec);

        this.router.get('/schema', async (req, res) => {
            res.status(HTTP_STATUS.OK).json({ schema: jc.decycle(schema.models) });
        });
        this.router.get('/version', async (req, res) => {
            res.status(HTTP_STATUS.OK).json({
                api: process.env.npm_package_version,
                db: GKB_DB_NAME,
                schema: getLoadVersion().version,
            });
        });
        addParserRoute(this); // doesn't require any data access so no auth required

        // add the addPostToken
        addPostToken(this);

        this.router.use(checkToken(this.conf.GKB_KEY));

        addEulaRoutes(this);

        addQueryRoute(this);
        addStatsRoute(this);

        // simple routes
        for (const model of Object.values(schema.models)) {
            if (model.name !== 'LicenseAgreement') {
                addResourceRoutes(this, model);
            }
        }
        addExtensionRoutes(this);

        // catch any other errors
        addErrorRoute(this);
        logger.log('info', 'Adding 404 capture');
        // last catch any errors for undefined routes. all actual routes should be defined above
        this.app.use((req, res) => res.status(HTTP_STATUS.NOT_FOUND).json({
            error: `Not Found: ${req.route}`,
            message: `The requested url does not exist: ${req.url}`,
            method: req.method,
            name: 'UrlNotFound',
            url: req.url,
        }));

        if (!this.port) {
            logger.log('info', 'finding an available port');
            this.port = await getPortPromise();
        }
        // @ts-ignore incorrect external type
        this.server = http.createServer(this.app).listen(this.port, this.host);
        logger.log('info', `started application server (${this.host}:${this.port})`);
    }

    async close() {
        logger.info('cleaning up');

        try {
            if (this.pool) {
                logger.info('closing the database pool');
                await this.pool.close();
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

export { AppServer, createConfig };
