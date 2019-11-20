/**
 * PM2 config file. MUST have config.js suffix (https://github.com/Unitech/pm2/issues/3529)
 */
const packageData = require('./../package.json'); // eslint-disable-line
const env = require('./../src/config');


module.exports = {
    apps: [
        {
            name: `${packageData.name.replace(/^@bcgsc\//, '')}`,
            script: 'npm',
            args: 'run start:prod',
            watch: false,
            max_restarts: 25,
            min_uptime: 10000, // min ms up before considered fail to start
            env: env.common || {},
            env_production: { ...env.production || {}, NODE_ENV: 'production' },
            env_staging: { ...env.staging || {}, NODE_ENV: 'production' },
            env_development: { ...env.development || {}, NODE_ENV: 'development' },
            env_local: { ...env.local || {}, NODE_ENV: 'local' },
            env_test: { ...env.test || {}, NODE_ENV: 'test' },
        },
    ],
};
