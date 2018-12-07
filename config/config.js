const {ORIENTDB_HOME} = process.env;

const dbName = 'test_empty';

const server = {
    pass: process.env.DATABASE_SERVER_PASS || 'root',
    user: process.env.DATABASE_SERVER_USER || 'root',
    port: process.env.DATABASE_PORT || 2426,
    host: process.env.DATABASE_HOST || 'orientdb02.bcgsc.ca'
};

const db = {
    name: dbName,
    url: `plocal:${ORIENTDB_HOME}/databases/${dbName}`,
    pass: process.env.DATABASE_PASS || 'admin',
    user: process.env.DATABASE_USER || 'admin',
    host: server.host,
    port: server.port
};

module.exports = {
    server,
    db,
    app: {port: process.env.PORT || 8080},
    private_key: process.env.KEY_FILE || 'id_rsa',
    disableAuth: process.env.DISABLE_AUTH === '1'
};
