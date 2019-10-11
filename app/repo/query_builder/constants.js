
/**
 * @constant
 * @type {Number}
 * @default
 */
const MAX_NEIGHBORS = 4;
/**
 * @constant
 * @type {Number}
 * @default
 */
const MAX_TRAVEL_DEPTH = 50;
/**
 * @constant
 * @type {Number}
 * @default
 */
const MAX_LIMIT = 1000;

/**
 * @constant
 * @type {string}
 * @default
 */
const PARAM_PREFIX = 'param';

/**
 * operators to be used in generating SQL statements
 * @namespace
 * @property {string} EQ equal to
 * @property {string} CONTAINS
 * @property {string} CONTAINSALL
 * @property {string} CONTAINSTEXT
 * @property {string} IN
 * @property {string} GTE greater than or equal to
 * @property {string} GT greater than
 * @property {string} LTE
 * @property {string} LT
 * @property {string} IS
 * @property {string} OR
 * @property {string} AND
 */
const OPERATORS = {
    EQ: '=',
    CONTAINS: 'CONTAINS',
    CONTAINSALL: 'CONTAINSALL',
    CONTAINSTEXT: 'CONTAINSTEXT',
    CONTAINSANY: 'CONTAINSANY',
    IN: 'IN',
    GTE: '>=',
    GT: '>',
    LTE: '<=',
    LT: '<',
    IS: 'IS',
    OR: 'OR',
    AND: 'AND',
};

const DIRECTIONS = ['out', 'in', 'both'];


module.exports = {
    MAX_LIMIT, MAX_TRAVEL_DEPTH, MAX_NEIGHBORS, OPERATORS, PARAM_PREFIX, DEFAULT_NEIGHBORS: 3, MIN_WORD_SIZE: 3, DIRECTIONS,
};
