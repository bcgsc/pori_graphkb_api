// Fetch the keycloak public key from the KC server using the keyloak admin credentials
const request = require('request-promise');
const form = require('form-urlencoded').default;
const fs = require('fs');
const path = require('path');
// required packages
const { AppServer, createConfig } = require('../src');
const { logger } = require('../src/repo/logging');

const fetchKey = async (uri) => {
    // get the token
    logger.info(`fetching token from ${uri}`);
    const {access_token: token} = JSON.parse(await request({
        body: form({
            client_id: 'admin-cli',
            grant_type: 'password',
            password: process.env.KEYCLOAK_PASSWORD,
            username: process.env.KEYCLOAK_USER,
        }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        uri,
    }));
    const REALM_URL = uri.replace('/protocol/openid-connect/token', '');
    logger.info(`fetching key from ${REALM_URL}`);
    const {public_key: key} = JSON.parse(await request({
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        method: 'GET',
        uri: REALM_URL,
    }));
    logger.info(`writing key file: config/keys/keycloak.key`);
    fs.writeFileSync(path.resolve(__dirname, '../config/keys/keycloak.key'), key);
};

const main = async () => {
    let app;
    try {
        const conf = createConfig({ GKB_DBS_PASS: process.env.GKB_DBS_PASS });
        await fetchKey(conf.GKB_KEYCLOAK_URI);
        app = new AppServer(conf);
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
};
main()
    .catch(() => {
        process.exit(1);
    });
