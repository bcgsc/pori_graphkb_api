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
} as const;

const DIRECTIONS = ['out', 'in', 'both'] as const;

const TREE_EDGES = ['SubClassOf', 'ElementOf'] as const;

const SIMILARITY_EDGES = [
    'AliasOf',
    'CrossReferenceOf',
    'DeprecatedBy',
    'GeneralizationOf',
    'Infers',
] as const;

const DEFAULT_NEIGHBORS = 3;
const MIN_WORD_SIZE = 3;
export {
    DEFAULT_NEIGHBORS,
    DIRECTIONS,
    MAX_LIMIT,
    MAX_NEIGHBORS,
    MAX_TRAVEL_DEPTH,
    MIN_WORD_SIZE,
    OPERATORS,
    PARAM_PREFIX,
    SIMILARITY_EDGES,
    TREE_EDGES,
};
