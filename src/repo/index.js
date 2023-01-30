const { OrientDBClient } = require('orientjs');

const { util } = require('@bcgsc-pori/graphkb-schema');

const { logger } = require('./logging');
const { loadSchema, createSchema } = require('./schema');
const { migrate } = require('./migrate');
const { createUser, update, getUserByName } = require('./commands');
const { RecordConflictError } = require('./error');
const { parseRecord } = require('./query_builder');

/**
 * Create the database and schema
 */
const createDB = async (server, {
    GKB_DBS_PASS,
    GKB_DBS_USER,
    GKB_DB_NAME,
    GKB_DB_PASS,
}) => {
    await server.createDatabase({
        name: GKB_DB_NAME,
        password: GKB_DBS_PASS,
        username: GKB_DBS_USER,
    });

    const db = await server.session({
        name: GKB_DB_NAME,
        password: GKB_DBS_PASS,
        username: GKB_DBS_USER,
    });

    try {
        await db.command('alter database custom standardElementConstraints=false');
        const adminUserExists = await db.query('select status from OUser where name = \'admin\';').all();

        if (adminUserExists.length === 0) {
            await db.command(`create user admin identified by ${GKB_DB_PASS} role admin;`);
        }

        logger.log('verbose', 'create the schema');
        await createSchema(db);
    } catch (err) {
        // drop the new database if we fail to create the schema
        await server.dropDatabase({
            name: GKB_DB_NAME,
            password: GKB_DBS_PASS,
            username: GKB_DBS_USER,
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
    GKB_USER_CREATE,
    GKB_DB_POOL,
    GKB_NEW_DB = false, // MUST create new db
}) => {
    // set up the database server
    const server = await OrientDBClient.connect({
        host: GKB_DB_HOST,
        port: GKB_DB_PORT,
    });
    const exists = await server.existsDatabase({
        name: GKB_DB_NAME,
        password: GKB_DBS_PASS,
        username: GKB_DBS_USER,
    });
    logger.log('info', `The database ${GKB_DB_NAME} ${exists
        ? 'exists'
        : 'does not exist'}`);

    if (GKB_DB_CREATE) {
        if (!exists) {
            // the db does not exist, create it
            await createDB(server, {
                GKB_DBS_PASS,
                GKB_DBS_USER,
                GKB_DB_NAME,
                GKB_DB_PASS,
                GKB_USER_CREATE,
            });
        } else if (GKB_NEW_DB) {
            // this check it mainly to stop us from accidentally connecting to a prod instance for testing
            throw new Error(`Cannot create a new database (${GKB_DB_NAME}) it already exists`);
        }
    }

    logger.log('info', `connecting to the database (${GKB_DB_NAME}) as ${GKB_DB_USER}`);
    let pool,
        session;

    try {
        pool = await server.sessions({
            name: GKB_DB_NAME,
            password: GKB_DB_PASS,
            pool: { max: GKB_DB_POOL },
            username: GKB_DB_USER,
        });
        session = await pool.acquire();
    } catch (err) {
        server.close();
        throw err;
    }

    if (GKB_USER_CREATE && process.env.USER) {
        try {
            logger.log('info', `create the current user (${process.env.USER}) as admin`);
            await createUser(session, {
                existsOk: true,
                groupNames: ['admin'],
                signedLicenseAt: util.timeStampNow(),
                userName: process.env.USER,
            });
        } catch (err) {
            if (!(err instanceof RecordConflictError)) {
                logger.log('error', `Error in creating the current user ${err}`);
            }
        }
    }

    // check if migration is required
    try {
        await migrate(session, { checkOnly: !GKB_DB_MIGRATE });
        // close and re-open the session (so that the db class models are updated)
        await session.close();
        session = await pool.acquire();
    } catch (err) {
        logger.error(err);
        server.close();
        throw err;
    }

    try {
        await loadSchema(session);
    } catch (err) {
        logger.error(err);
        session.close();
        throw err;
    }
    session.close();
    // create the admin user
    return { pool, server };
};

/**
 * Add a login to the users record
 */
const incrementUserVisit = async (db, username) => {
    const userRecord = await getUserByName(db, username);
    const changes = {
        firstLoginAt: util.timeStampNow(),
        lastLoginAt: util.timeStampNow(),
        loginCount: 1,
    };

    if (userRecord.loginCount) {
        changes.loginCount = userRecord.loginCount + 1;
    }
    if (userRecord.firstLoginAt) {
        changes.firstLoginAt = userRecord.firstLoginAt;
    }
    await update(db, {
        changes,
        modelName: 'User',
        paranoid: false,
        query: parseRecord('User', { '@rid': userRecord['@rid'] }),
        user: userRecord,
    });
};

module.exports = { connectDB, incrementUserVisit };
