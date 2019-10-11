// required packages
const { AppServer, createConfig } = require('./src');
const { logger } = require('./src/repo/logging');

// process.on('uncaughtException', app.close);
let app;

(async () => {
    try {
        app = new AppServer(createConfig({ GKB_DBS_PASS: process.env.GKB_DBS_PASS }));
        await app.listen();

        // cleanup
        process.on('SIGINT', async () => {
            if (app) {
                await app.close();
            }
            process.exit(1);
        });
    } catch (err) {
        logger.error(`Failed to start server: ${err}`);
        logger.error(err.stack);
        app.close();
        throw err;
    }
})();
