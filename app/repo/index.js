const {OrientDBClient} = require('orientjs');

const {logger} = require('./logging');
const {loadSchema, createSchema} = require('./schema');
const {migrate} = require('./migrate');
const {createUser} = require('./commands');
const {RecordExistsError} = require('./error');


/**
 * Create the database and schema
 */
const createDB = async (server, {
    GKB_DB_NAME,
    GKB_DBS_PASS,
    GKB_DBS_USER
}) => {
    await server.createDatabase({
        name: GKB_DB_NAME,
        username: GKB_DBS_USER,
        password: GKB_DBS_PASS
    });
    const db = await server.session({
        name: GKB_DB_NAME,
        username: GKB_DBS_USER,
        password: GKB_DBS_PASS
    });
    try {
        await db.command('alter database custom standardElementConstraints=false');
        logger.log('verbose', 'create the schema');
        await createSchema(db);
    } catch (err) {
        // drop the new database if we fail to create the schema
        await server.dropDatabase({
            name: GKB_DB_NAME,
            username: GKB_DBS_USER,
            password: GKB_DBS_PASS
        });
        await server.close();
        throw err;
    }
};

/**
 * @typedef connection
 * @property {OrientDBClient} server the client server connection
 * @property {object} db the database session
 */

/**
 * Connect to an existing database or create a new one and connect to it
 *
 * @param {object} opt
 * @param {boolean} opt.GKB_DB_CREATE create a new database if it does not already exist
 * @param {string} opt.GKB_DB_HOST the database server host name
 * @param {boolean} opt.GKB_DB_MIGRATE migrate the schema on the current database if required
 * @param {string} opt.GKB_DB_NAME the name of the database to be created/connected to
 * @param {string} opt.GKB_DB_PASS the database password
 * @param {Number} opt.GKB_DB_PORT the database server port
 * @param {string} opt.GKB_DB_USER the database username
 * @param {string} opt.GKB_DBS_USER the database server username
 * @param {string} opt.GKB_DBS_PASS the database server password
 * @param {boolean} opt.GKB_USER_CREATE create an admin user with the current user
 *
 * @returns {connection} the server/db-client and db/session objects
 *
 */
const connectDB = async ({
    GKB_DB_CREATE,
    GKB_DB_HOST,
    GKB_DB_MIGRATE,
    GKB_DB_NAME,
    GKB_DB_PASS,
    GKB_DB_PORT,
    GKB_DB_USER,
    GKB_DBS_PASS,
    GKB_DBS_USER,
    GKB_USER_CREATE
}) => {
    // set up the database server
    const server = await OrientDBClient.connect({
        host: GKB_DB_HOST,
        port: GKB_DB_PORT
    });
    const exists = await server.existsDatabase({
        name: GKB_DB_NAME,
        username: GKB_DBS_USER,
        password: GKB_DBS_PASS
    });
    logger.log('info', `The database ${GKB_DB_NAME} ${exists
        ? 'exists'
        : 'does not exist'}`);

    let db;
    if (GKB_DB_CREATE) {
        if (!exists) {
            // the db does not exist, create it
            await createDB(server, {
                GKB_DB_NAME,
                GKB_DBS_PASS,
                GKB_DBS_USER,
                GKB_USER_CREATE
            });
        } else {
            throw new Error(`Cannot create the database ${GKB_DB_NAME} it already exists`);
        }
    }

    if (!db) {
        logger.log('info', `connecting to the database (${GKB_DB_NAME}) as ${GKB_DB_USER}`);
        try {
            db = await server.session({name: GKB_DB_NAME, username: GKB_DB_USER, password: GKB_DB_PASS});
        } catch (err) {
            server.close();
            throw err;
        }
    }

    if (GKB_USER_CREATE && process.env.USER) {
        try {
            logger.log('info', `create the current user (${process.env.USER}) as admin`);
            await createUser(db, {
                userName: process.env.USER,
                groupNames: ['admin'],
                existsOk: true
            });
        } catch (err) {
            if (!(err instanceof RecordExistsError)) {
                logger.log('error', `Error in creating the current user ${err}`);
            }
        }
    }

    // check if migration is required
    try {
        await migrate(db, {checkOnly: !GKB_DB_MIGRATE});
    } catch (err) {
        logger.error(err);
        server.close();
        throw err;
    }

    let schema;
    try {
        schema = await loadSchema(db);
    } catch (err) {
        logger.error(err);
        db.close();
        throw err;
    }
    // create the admin user
    return {server, db, schema};
};


module.exports = {connectDB};
