/**
 * The query module is reponsible for building the complex psuedo-SQL statements
 */

/**
 * @constant
 * @ignore
 */

const {
    Comparison, Clause, Query, nestedProjection
} = require('./query');
const {Traversal} = require('./traversal');
const match = require('./match');
const constants = require('./constants');
const {searchByLinkedRecords} = require('./search');
const {keywordSearch: generalKeywordSearch} = require('./statement');

const util = require('./util');


module.exports = {
    Query,
    Clause,
    Comparison,
    Traversal,
    match,
    constants,
    util,
    generalKeywordSearch,
    searchByLinkedRecords,
    nestedProjection
};
