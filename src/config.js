module.exports = {
    common: {
        GKB_DISABLE_AUTH: false,
        GKB_DBS_USER: 'root',
        GKB_DB_CREATE: true,
        GKB_DB_HOST: 'orientdbdev.bcgsc.ca',
        GKB_DB_MIGRATE: true,
        GKB_DB_PASS: 'admin',
        GKB_DB_PORT: 2424,
        GKB_DB_USER: 'admin',
        GKB_DB_POOL: 25,
        GKB_KEYCLOAK_CLIENT_ID: 'GraphKB',
        GKB_KEYCLOAK_ROLE: 'GraphKB',
        GKB_KEYCLOAK_URI: 'http://keycloakdev.bcgsc.ca/auth/realms/GSC/protocol/openid-connect/token',
        GKB_KEYCLOAK_KEY_FILE: 'config/keys/keycloak-dev.key',
        GKB_KEY_FILE: 'id_rsa',
        GKB_LOG_DIR: 'logs',
        GKB_LOG_LEVEL: 'debug',
        GKB_PORT: 8080,
        GKB_USER_CREATE: true,
        GKB_CORS_ORIGIN: '^.*$',
        GKB_HOST: process.env.HOSTNAME,
    },
    development: {
        GKB_DB_CREATE: false,
        GKB_LOG_MAX_FILES: 7,
        GKB_DB_NAME: 'production-sync-dev',
    },
    staging: {
        GKB_DB_CREATE: false,
        GKB_LOG_MAX_FILES: 14,
        GKB_DB_NAME: 'production-sync-staging',
        GKB_KEYCLOAK_KEY_FILE: 'config/keys/keycloak-dev.key',
        GKB_CORS_ORIGIN: 'https://graphkbstaging.bcgsc.ca',
    },
    local: {
        GKB_CORS_ORIGIN: '^.*$',
    },
    production: {
        GKB_DB_CREATE: false,
        GKB_DB_HOST: 'orientdb.bcgsc.ca',
        GKB_DB_NAME: 'production',
        GKB_KEYCLOAK_KEY_FILE: 'config/keys/keycloak.sso.key',
        GKB_KEYCLOAK_URI: 'https://sso.bcgsc.ca/auth/realms/GSC/protocol/openid-connect/token',
        GKB_LOG_LEVEL: 'info',
        GKB_LOG_MAX_FILES: 28,
        GKB_CORS_ORIGIN: 'https://graphkb.bcgsc.ca',
    },
    test: {
        GKB_DISABLE_AUTH: true,
        GKB_LOG_LEVEL: 'error',
    },
};
