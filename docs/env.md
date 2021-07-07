# Configurable Environment Variables

## Database settings

| Variable       | Default             | Description                                                                            |
| -------------- | ------------------- | -------------------------------------------------------------------------------------- |
| GKB_DBS_PASS   | root                | Database server password                                                               |
| GKB_DBS_USER   | root                | Database server username                                                               |
| GKB_DB_PORT    | 2426                | Port the DB server is using                                                            |
| GKB_DB_HOST    | orientdb02.bcgsc.ca | Host the DB server is using                                                            |
| GKB_DB_USER    | admin               | Database username                                                                      |
| GKB_DB_PASS    | admin               | Database password                                                                      |
| GKB_DB_NAME    | `kbapi_<VERSION>`   | Database name to use                                                                   |
| GKB_DB_CREATE  | false               | Set this to `1` to create the database if it does not exist                            |
| GKB_DB_MIGRATE | false               | Set this to `1` to attempt to migrate the database if it exists and requires migration |

## API Settings

| Variable      | Default | Description                                                                                                       |
| ------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| GKB_PORT      | 8080    | Port for the API to start on                                                                                      |
| GKB_KEY_FILE  | id_rsa  | Path to the private key to use for generating tokens                                                              |
| GKB_LOG_LEVEL | info    | The level of information to log to the screen and log files                                                       |
| GKB_BASE_PATH |         | The base path for requests to the API. This should be changed if you are serving the API from a subdirectory/path |

## Key Cloak Settings

| Variable              | Default                                                                          | Description                                                                                                |
| --------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GKB_KEYCLOAK_URI      | http://ga4ghdev01.bcgsc.ca:8080/auth/realms/TestKB/protocol/openid-connect/token | defaults to https://sso.bcgsc.ca/auth/realms/GSC/protocol/openid-connect/token for production environments |
| GKB_KEYCLOAK_CLIENTID | GraphKB                                                                          |                                                                                                            |
| GKB_KEYCLOAK_KEYFILE  | keycloak.id_rsa.pub                                                              | path to the public key file used to verify keycloak tokens                                                 |
| GKB_KEYCLOAK_ROLE     | GraphKB                                                                          | The required role to get from the keycloak user registration                                               |
| GKB_DISABLE_AUTH      |                                                                                  | Set to `1` to disable the external (keycloak) authentication (For testing)                                 |

## Logging

By default the API will log at the warning level. This can be configured using the environment
variable `GKB_LOG_LEVEL` which must be one of: info, error, warn, info, verbose, or debug
([corresponding to the npm logging levels](https://www.npmjs.com/package/winston#logging-levels))

```bash
export GKB_LOG_LEVEL=error
```
