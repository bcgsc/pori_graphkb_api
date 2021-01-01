# Contributing

We welcome new developers to this project. To see the guidlines on how you can get started
and the conventions that are used, follow this guide

## Getting Started

Clone the repository

```bash
git clone https://github.com/bcgsc/pori_graphkb_api.git
cd pori_graphkb_api
git checkout develop
```

Install the dependencies

```bash
npm install
```

To actually use the API, the orientDB instance must already be running. To configure where the tests will point to the user can either modify `config/config.js` or set the [environment variables](env.md) which override this config (default values are shown below, this will change depending on how you db server is configured).

```bash
GKB_DBS_PASS=root
GKB_DBS_USER=root
GKB_DB_HOST='orientdb02.bcgsc.ca'
GKB_DB_PORT=2480
GKB_KEY_FILE='id_rsa'  # used in generating the tokens
```

After these options are configured, the full set of tests can be run

```bash
npm run test
```

The non-database tests can be run without the above configuration

```bash
npm run test:unit
```

Just the tests which require a database connection can be run with

```bash
npm run test:integration
```

## Test Envinronments

Default configurations for all non-sensitive content can be set using the various start commands

The local test envinronment should be used for testing without authentication

```bash
npm run start:local
```

The dev test environment should be used for developing against the test keycloak server (can only be used within the same network as the auth server being used).
This defaults connecting to the development database (backup of production)

```bash
npm run start:dev
```

## Deploy with PM2

This example deploys a tag named v1.1.0

SSH to the host server and clone the repository

```bash
ssh <SERVER NAME>
cd /var/www/app/graphkb-api
git clone https://github.com/bcgsc/pori_graphkb_api.git v1.1.0
cd v1.1.0
git checkout v1.1.0
```

Install the dependencies

```bash
npm install
```

Create the keyfile

```bash
yes | ssh-keygen -t rsa -b 4096 -f id_rsa -N ''
```

Create the logging directories

```bash
mkdir logs
```

Create an env.sh file to hold the [configurable environment variables](./env.md) as well as the PM2 ones

```bash
export PM2_HOME=/var/www/app/graphkb_api/pm2_logs
```

Set the Database password (It is better not to store this)

```bash
export GKB_DBS_PASS=<some password>
```

Now source the file and start your pm2 process

```bash
pm2 start config/pm2.config.js --env development
```

You should now be able to view the running process with

```bash
pm2 ls
```
