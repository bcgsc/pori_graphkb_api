// main jest configuration file
const defaults = require('./config');

module.exports = {
    ...defaults,
    setupFilesAfterEnv: [
        '<rootDir>/test/jest.setup.js',
    ],
    testPathIgnorePatterns: [
        '/node_modules/',
        'test/db_integration',
    ],
};
