const path = require('path');

/**
 * Get the current schema version to detect if a migration is required
 *
 * @param {orientjs.Db} db the database connection
 */
const getCurrentVersion = async (db) => {
    const [{ version }] = await db.query('SELECT * FROM SchemaHistory ORDER BY createdAt DESC LIMIT 1').all();
    return version;
};

/**
 * Gets the current version with respect to the node modules installed
 *
 * @returns {object} metadata about the installed schema package
 */
const getLoadVersion = () => {
    const pathToVersionInfo = path.join(
        path.dirname(require.resolve('@bcgsc/knowledgebase-schema')),
        '../package.json',
    );
    // must be a global require, currently no other way to obtain dependency package version info of the actual install
    const {version, name, _resolved} = require(pathToVersionInfo); // eslint-disable-line
    return { name, url: _resolved, version };
};


module.exports = { getCurrentVersion, getLoadVersion };
