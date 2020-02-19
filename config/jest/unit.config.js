// main jest configuration file
const defaults = require('./config');

module.exports = {
    ...defaults,
    testPathIgnorePatterns: [
        '/node_modules/',
        'test/repo/query_builder/util.js',
        'test/util.js',
        'test/db_integration',
    ],
};
