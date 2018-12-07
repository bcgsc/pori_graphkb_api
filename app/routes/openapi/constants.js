const path = require('path');

const DEFAULT_QUERY_LIMIT = 100;
const MAX_JUMPS = 4;
const MAX_QUERY_LIMIT = 1000;
const ABOUT_FILE = path.join(__dirname, '../../../doc/about.md');
const SEARCH_ABOUT = path.join(__dirname, '../../../doc/search.md');
const QUERY_ABOUT = path.join(__dirname, '../../../doc/query.md');

module.exports = {
    DEFAULT_QUERY_LIMIT, MAX_JUMPS, MAX_QUERY_LIMIT, ABOUT_FILE, SEARCH_ABOUT, QUERY_ABOUT
};