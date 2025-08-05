const path = require('path');

/**
 * @constant
 * @type {Number}
 * @default
*/
const DEFAULT_QUERY_LIMIT = 100;
/**
 * @constant
 * @type {Number}
 * @default
*/
const MAX_JUMPS = 4;
/**
 * @constant
 * @type {Number}
 * @default
*/
const MAX_QUERY_LIMIT = 1000;
/**
 * @constant
 * @type {string}
 * @default
*/
const ABOUT_FILE = path.join(__dirname, './docs/intro.md');
/**
 * @constant
 * @type {string}
 * @default
*/
const QUERY_ABOUT = path.join(__dirname, './docs/query.md');
const SUBGRAPHS_ABOUT = path.join(__dirname, './docs/subgraphs.md');

module.exports = {
    ABOUT_FILE,
    DEFAULT_QUERY_LIMIT,
    MAX_JUMPS,
    MAX_QUERY_LIMIT,
    QUERY_ABOUT,
    SUBGRAPHS_ABOUT,
};
