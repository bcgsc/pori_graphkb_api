const { OrientDBClient } = require('orientjs');

const connectDB = async (opt) => {
    const server = await OrientDBClient.connect({
        host: opt.GKB_DB_HOST,
        port: opt.GKB_DB_PORT,
    });

    let pool;

    try {
        pool = await server.sessions({
            name: opt.GKB_DB_NAME,
            password: opt.GKB_DB_PASS,
            pool: { max: opt.GKB_DB_POOL },
            username: opt.GKB_DB_USER,
        });
    } catch (err) {
        server.close();
        throw err;
    }
    return { pool, server };
};

const connectionWrapper = async (handler, opt = {}) => {
    try {
        // Connecting
        const db = await connectDB({
            GKB_DB_HOST: 'orientdbdev.bcgsc.ca',
            GKB_DB_NAME: 'production-sync-dev',
            GKB_DB_PASS: process.env.GKB_DBS_PASS,
            GKB_DB_POOL: 25,
            GKB_DB_PORT: 2424,
            GKB_DB_USER: 'root',
        });
        const session = await db.pool.acquire();

        // call main function
        await handler(session, opt);

        // Closing
        await session.close();
        await db.pool.close();
        await db.server.close();
        process.exit();
    } catch (err) {
        console.error(`Failed to start server: ${err}`);
        console.error(err.stack);
        throw err;
    }
};

module.exports = {
    connectDB,
    connectionWrapper,
};
