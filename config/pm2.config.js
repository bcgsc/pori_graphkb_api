/**
 * PM2 config file. MUST have config.js suffix (https://github.com/Unitech/pm2/issues/3529)
 */
const packageData = require('./../package.json'); // eslint-disable-line
const env = require('./../src/config');


module.exports = {
    apps: [
        {
            args: 'run start:prod',
            // min ms up before considered fail to start
            env: env.common || {},

            env_development: { ...env.development || {}, NODE_ENV: 'development' },

            env_local: { ...env.local || {}, NODE_ENV: 'local' },

            env_production: { ...env.production || {}, NODE_ENV: 'production' },

            env_staging: { ...env.staging || {}, NODE_ENV: 'production' },
            env_test: { ...env.test || {}, NODE_ENV: 'test' },
            max_restarts: 25,
            min_uptime: 10000,
            name: `${packageData.name.replace(/^@bcgsc-pori\//, '')}`,
            script: 'npm',
            watch: false,
        },
    ],
};
