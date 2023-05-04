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
    AND: 'AND',
    CONTAINS: 'CONTAINS',
    CONTAINSALL: 'CONTAINSALL',
    CONTAINSANY: 'CONTAINSANY',
    CONTAINSTEXT: 'CONTAINSTEXT',
    EQ: '=',
    GT: '>',
    GTE: '>=',
    IN: 'IN',
    INSTANCEOF: 'INSTANCEOF',
    IS: 'IS',
    LT: '<',
    LTE: '<=',
    OR: 'OR',
};

const DIRECTIONS = ['out', 'in', 'both'];

const TREE_EDGES = ['SubClassOf', 'ElementOf', 'Infers'];

const SIMILARITY_EDGES = [
    'AliasOf',
    'CrossReferenceOf',
    'DeprecatedBy',
    'GeneralizationOf',
];

module.exports = {
    DEFAULT_NEIGHBORS: 3,
    DIRECTIONS,
    MAX_LIMIT,
    MAX_NEIGHBORS,
    MAX_TRAVEL_DEPTH,
    MIN_WORD_SIZE: 3,
    OPERATORS,
    PARAM_PREFIX,
    SIMILARITY_EDGES,
    TREE_EDGES,
};
