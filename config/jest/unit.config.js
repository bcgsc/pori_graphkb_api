// main jest configuration file
const defaults = require('./config');

module.exports = {
    ...defaults,
    testPathIgnorePatterns: [
        '/node_modules/',
        'test/db_integration',
    ],
};
