/**
 * Create neighborhood queries where some conditions are loosely matched and then expanded to
 * surrounding verticies
 */
/**
 * @constant
 * @ignore
 */
const {util: {castToRID}, error: {AttributeError}, schema: {schema}} = require('@bcgsc/knowledgebase-schema');
const {quoteWrap} = require('./../util');

const {
    MAX_TRAVEL_DEPTH, MAX_NEIGHBORS, DEFAULT_NEIGHBORS
} = require('./constants');
const {castRangeInt} = require('./util');


const SIMILARITY_EDGES = [
    'AliasOf',
    'ElementOf',
    'CrossReferenceOf',
    'DeprecatedBy',
    'GeneralizationOf',
    'Infers'
];


/**
 * @param {Object} opt options
 * @param {Clause} opt.filters the conditions of the match
 * @param {string} opt.target the name of the starting model
 * @param {Number} opt.paramIndex the starting index to use in naming parameter aliases
 * @param {Array.<string>} opt.edges list of edge class names to follow in creating the neighborhood
 * @param {string} opt.direction the direction to follow (in/out)
 */
const treeQuery = (opt) => {
    const {
        filters, target, paramIndex = 0, direction
    } = opt;
    const edges = opt.edges || ['SubclassOf'];
    const depth = castRangeInt(opt.depth || MAX_TRAVEL_DEPTH, 1, MAX_TRAVEL_DEPTH);

    if (!['out', 'in'].includes(direction)) {
        throw new AttributeError(`direction (${direction}) must be in or out`);
    }

    const {query, params} = filters.toString(paramIndex);
    const edgeList = Array.from(edges, quoteWrap).join(', ');
    const statement = `TRAVERSE ${direction}(${edgeList}) FROM (
        SELECT * FROM ${target} WHERE ${query}
    ) MAXDEPTH ${depth}`;
    return {query: statement, params};
};

/**
 * @param {Object} opt options
 * @param {Clause} opt.filters the conditions of the match
 * @param {string} opt.target the name of the starting model
 * @param {Number} opt.paramIndex the starting index to use in naming parameter aliases
 * @param {Array.<string>} opt.edges list of edge class names to follow in creating the neighborhood
 * @param {Number} opt.depth the number of jumps away to follow (max distance away)
 */
const neighborhood = ({
    filters, target, paramIndex = 0, edges = [], depthIn
}) => {
    // check the edges are valid edge names
    for (const edge of edges) {
        if (!schema.get(edge)) {
            throw new AttributeError(`Invalid edge parameter (${edge})`);
        }
    }
    const depth = castRangeInt(depthIn || DEFAULT_NEIGHBORS, 0, MAX_NEIGHBORS);

    const {query, params} = filters.toString(paramIndex);
    const statement = `SELECT * FROM (MATCH
    {class: ${target}, WHERE: (${query})}
        .both(${edges.map(quoteWrap).join(', ')}){WHILE: ($depth < ${depth})}
RETURN DISTINCT $pathElements)`;
    return {query: statement, params};
};


const similarTo = ({
    target, prefix = '', history = false, paramIndex = 0, edges = SIMILARITY_EDGES
} = {}) => {
    // TODO: Move back to using substitution params pending: https://github.com/orientechnologies/orientjs/issues/376
    let initialQuery,
        params = {};
    if (Array.isArray(target)) {
        initialQuery = `[${target.map(p => castToRID(p).toString()).join(', ')}]`;
    } else {
        const {query: initialStatement, params: initialParams} = target.toString
            ? target.toString(paramIndex)
            : target;

        initialQuery = `(${initialStatement})`; // recordIdList is a subquery instead of a list of record IDs
        params = {...initialParams};
    }
    const disambiguationClause = cond => `TRAVERSE both(${edges.map(e => `'${e}'`).join(', ')}) FROM ${cond} MAXDEPTH ${MAX_NEIGHBORS}`;
    // disambiguate
    const innerQuery = `SELECT expand($${prefix}Result)
        LET $${prefix}Initial = (${disambiguationClause(initialQuery)}),
        $${prefix}Ancestors = (TRAVERSE in('SubClassOf') FROM (SELECT expand($${prefix}Initial)) MAXDEPTH ${MAX_TRAVEL_DEPTH}),
        $${prefix}Descendants = (TRAVERSE out('SubClassOf') FROM (SELECT expand($${prefix}Initial)) MAXDEPTH ${MAX_TRAVEL_DEPTH}),
        $${prefix}Union = (SELECT expand(UNIONALL($${prefix}Ancestors, $${prefix}Descendants))),
        $${prefix}Result = (${disambiguationClause(`(SELECT expand($${prefix}Union))`)})`;

    // filter duplicates and re-expand
    const query = `SELECT expand(rid) FROM (SELECT distinct(@rid) as rid FROM (${innerQuery}))`;
    if (!history) {
        return {query: `SELECT * FROM (${query}) WHERE deletedAt IS NULL`, params};
    }
    return {query, params};
};


/**
 * From some starting node (defined by the where clause conditions) follow all incoming edges and
 * return the set of nodes visited
 *
 * @param {Object} opt options
 * @param {Clause} opt.filters the conditions of the match
 * @param {string} opt.target the name of the starting model
 * @param {Number} opt.paramIndex the starting index to use in naming parameter aliases
 * @param {Array.<string>} opt.edges list of edge class names to follow in creating the neighborhood
 */
const ancestors = (opt) => {
    opt.direction = 'in';
    return treeQuery(opt);
};

/**
 * From some starting node (defined by the where clause conditions) follow all outgoing edges and
 * return the set of nodes visited
 *
 * @param {Object} opt options
 * @param {Clause} opt.filters the conditions of the match
 * @param {string} opt.target the name of the starting model
 * @param {Number} opt.paramIndex the starting index to use in naming parameter aliases
 * @param {Array.<string>} opt.edges list of edge class names to follow in creating the neighborhood
 */
const descendants = (opt) => {
    opt.direction = 'out';
    return treeQuery(opt);
};


class FixedSubquery {
    constructor(queryType, queryBuilder, opt = {}) {
        this.queryType = queryType;
        this.queryBuilder = queryBuilder;
        this.opt = opt;
        this.isSubquery = true;
    }

    toString(paramIndex = 0, prefix = '') {
        return this.queryBuilder({...this.opt, paramIndex, prefix: prefix || this.opt.prefix});
    }

    static parse({queryType, ...opt}) {
        if (queryType === 'ancestors') {
            return new this(queryType, ancestors, opt);
        } if (queryType === 'descendants') {
            return new this(queryType, descendants, opt);
        } if (queryType === 'neighborhood') {
            return new this(queryType, neighborhood, opt);
        } if (queryType === 'similarTo') {
            return new this(queryType, similarTo, opt);
        }
        throw new AttributeError(`Unrecognized query type (${queryType}) expected one of [ancestors, descendants, neighborhood, similarTo]`);
    }
}


module.exports = {FixedSubquery};
