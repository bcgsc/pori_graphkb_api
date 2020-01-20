/**
 * Create neighborhood queries where some conditions are loosely matched and then expanded to
 * surrounding verticies
 */
/**
 * @constant
 * @ignore
 */
const { util: { castToRID }, error: { AttributeError }, schema: { schema } } = require('@bcgsc/knowledgebase-schema');
const { quoteWrap } = require('./../util');

const {
    MAX_TRAVEL_DEPTH, MAX_NEIGHBORS, DEFAULT_NEIGHBORS, OPERATORS, MIN_WORD_SIZE,
} = require('./constants');
const { castRangeInt } = require('./util');


const SIMILARITY_EDGES = [
    'AliasOf',
    'ElementOf',
    'CrossReferenceOf',
    'DeprecatedBy',
    'GeneralizationOf',
    'Infers',
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
        filters, target: rawTarget, paramIndex = 0, direction, history = false,
    } = opt;
    const edges = opt.edges || ['SubclassOf'];
    const depth = castRangeInt(opt.depth || MAX_TRAVEL_DEPTH, 1, MAX_TRAVEL_DEPTH);

    let params = {},
        target = rawTarget;

    if (Array.isArray(rawTarget)) {
        target = `[${rawTarget.map(castToRID).map(rid => rid.toString()).join(', ')}]`;
    } else if (schema[target] === undefined) {
        throw new AttributeError(`Invalid target class (${target})`);
    } else {
        const { query, params: whereParams } = filters.toString(paramIndex);
        target = `(SELECT * FROM ${target} WHERE ${query})`;
        params = whereParams;
    }

    if (!['out', 'in'].includes(direction)) {
        throw new AttributeError(`direction (${direction}) must be in or out`);
    }

    const edgeList = Array.from(edges, quoteWrap).join(', ');
    let statement = `TRAVERSE ${direction}(${edgeList}) FROM ${target} MAXDEPTH ${depth}`;

    if (!history) {
        statement = `SELECT * FROM (${statement}) WHERE deletedAt IS NULL`;
    }
    return { query: statement, params };
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
    filters, target, paramIndex = 0, edges = [], depthIn,
}) => {
    // check the edges are valid edge names
    for (const edge of edges) {
        if (!schema.get(edge)) {
            throw new AttributeError(`Invalid edge parameter (${edge})`);
        }
    }

    if (schema[target] === undefined) {
        throw new AttributeError(`Invalid target class (${target})`);
    }
    const depth = castRangeInt(depthIn || DEFAULT_NEIGHBORS, 0, MAX_NEIGHBORS);

    const { query, params } = filters.toString(paramIndex);
    const statement = `SELECT * FROM (MATCH
    {class: ${target}, WHERE: (${query})}
        .both(${edges.map(quoteWrap).join(', ')}){WHILE: ($depth < ${depth})}
RETURN DISTINCT $pathElements)`;
    return { query: statement, params };
};


const similarTo = ({
    target, prefix = '', history = false, paramIndex = 0, edges = SIMILARITY_EDGES, matchType, ...rest
} = {}) => {
    // TODO: Move back to using substitution params pending: https://github.com/orientechnologies/orientjs/issues/376
    let initialQuery,
        params = {};

    if (Object.keys(rest).length) {
        throw new AttributeError(`unrecognized arguments (${Object.keys(rest).join(', ')})`);
    }
    if (Array.isArray(target)) {
        initialQuery = `[${target.map(p => castToRID(p).toString()).join(', ')}]`;
    } else {
        const { query: initialStatement, params: initialParams } = target.toString(paramIndex, prefix);

        initialQuery = `(${initialStatement})`; // recordIdList is a subquery instead of a list of record IDs
        params = { ...initialParams };
    }

    const treeEdges = ['SubclassOf', 'ElementOf'].map(e => `'${e}'`).join(', ');

    const disambiguationClause = cond => `TRAVERSE both(${edges.map(e => `'${e}'`).join(', ')}) FROM ${cond} MAXDEPTH ${MAX_NEIGHBORS}`;
    // disambiguate
    const innerQuery = `SELECT expand($${prefix}Result)
        LET $${prefix}Initial = (${disambiguationClause(initialQuery)}),
        $${prefix}Ancestors = (TRAVERSE in(${treeEdges}) FROM (SELECT expand($${prefix}Initial)) MAXDEPTH ${MAX_TRAVEL_DEPTH}),
        $${prefix}Descendants = (TRAVERSE out(${treeEdges}) FROM (SELECT expand($${prefix}Initial)) MAXDEPTH ${MAX_TRAVEL_DEPTH}),
        $${prefix}Union = (SELECT expand(UNIONALL($${prefix}Ancestors, $${prefix}Descendants))),
        $${prefix}Result = (${disambiguationClause(`(SELECT expand($${prefix}Union))`)})`;

    // filter duplicates and re-expand
    let query = `SELECT expand(rid) FROM (SELECT distinct(@rid) as rid FROM (${innerQuery}))`;

    if (matchType) {
        if (!schema[matchType]) {
            throw new AttributeError(`Did not recognize type matchType (${matchType})`);
        }
        if (!history) {
            query = `SELECT * FROM (${query}) WHERE deletedAt IS NULL AND @this INSTANCEOF ${schema[matchType].name}`;
        } else {
            query = `SELECT * FROM (${query}) WHERE @this INSTANCEOF ${schema[matchType].name}`;
        }
    } else if (!history) {
        query = `SELECT * FROM (${query}) WHERE deletedAt IS NULL`;
    }
    return { query, params };
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


const keywordSearch = ({
    target, keyword, paramIndex, prefix, operator = OPERATORS.CONTAINSTEXT, ...opt
}) => {
    // circular dependency unavoidable
    const { Subquery } = require('./fragment'); // eslint-disable-line global-require

    const model = schema[target];

    if (![OPERATORS.CONTAINSTEXT, OPERATORS.EQ].includes(operator)) {
        throw new AttributeError(`Invalid operator (${operator}). Keyword search only accepts = or CONTAINSTEXT`);
    }
    if (!model) {
        throw new AttributeError('Invalid target class');
    }
    if (model.isEdge) {
        throw new AttributeError(`Cannot keyword search edge classes (${target})`);
    }

    if (!keyword) {
        throw new AttributeError('Missing required keyword parameter');
    }

    // remove any duplicate words
    const wordList = operator === OPERATORS.CONTAINSTEXT
        ? keyword.split(/\s+/).map(word => word.trim().toLowerCase())
        : [keyword.trim().toLowerCase()];

    if (operator === OPERATORS.CONTAINSTEXT && wordList.some(word => word.length < MIN_WORD_SIZE)) {
        const shortWords = wordList.filter(word => word.length < MIN_WORD_SIZE);
        throw new AttributeError(
            `Keywords (${shortWords.join(', ')}) are too short to query with. Must be at least ${
                MIN_WORD_SIZE
            } letters after splitting on whitespace characters`,
        );
    }
    if (wordList.length < 1) {
        throw new AttributeError('missing keywords');
    }
    const keywords = Array.from(new Set(wordList));


    // each queryword must be found but it can be in any of the prop
    const subContainsClause = (props) => {
        const filters = [];

        // must contains all words but words can exist in any prop
        for (const word of keywords) {
            let clause;

            if (props.length === 1) {
                const [prop] = props;
                clause = { [prop]: word, operator };
            } else {
                clause = { OR: [] };

                for (const prop of props) {
                    clause.OR.push({ [prop]: word, operator });
                }
            }
            filters.push(clause);
        }
        return { AND: filters };
    };

    if (model.inherits.includes('Ontology') || model.name === 'Ontology') {
        return Subquery.parse({
            ...opt,
            queryType: 'similarTo',
            target: {
                target: model.name,
                filters: subContainsClause(['sourceId', 'name']),
            },
            matchType: model.name,
        }).toString(paramIndex, prefix);
    } if (model.name === 'Statement') {
        const { query: subquery, params } = Subquery.parse({
            ...opt,
            queryType: 'similarTo',
            target: {
                target: 'Ontology',
                filters: subContainsClause(['sourceId', 'name']),
            },
        }).toString(paramIndex, prefix);

        const query = `SELECT expand($statements)
            LET $ont = (${subquery}),
                $variants = (TRAVERSE both('Infers') FROM (
                    SELECT * FROM Variant WHERE type IN (SELECT expand($ont)) OR reference1 in (SELECT expand($ont)) OR reference2 IN (SELECT expand($ont))
                ) MAXDEPTH ${MAX_NEIGHBORS}),
                $implicable = (SELECT expand(UNIONALL($ont, $variants))),
                $statements = (SELECT * FROM Statement
                    WHERE
                        conditions CONTAINSANY (SELECT expand($implicable))
                        OR evidence CONTAINSANY (SELECT expand($ont))
                        OR subject IN (SELECT expand($implicable))
                        OR relevance IN (SELECT expand($ont))
                )
        `;
        return { query, params };
    } if (model.inherits.includes('Variant') || model.name === 'Variant') {
        const { query: subquery, params } = Subquery.parse({
            ...opt,
            queryType: 'similarTo',
            target: {
                target: 'Ontology',
                filters: subContainsClause(['sourceId', 'name']),
            },
        }).toString(paramIndex, prefix);

        const query = `SELECT expand($variants)
            LET $ont = (${subquery}),
                $variants = (TRAVERSE both('Infers') FROM (
                    SELECT * FROM Variant WHERE type IN (SELECT expand($ont)) OR reference1 in (SELECT expand($ont)) OR reference2 IN (SELECT expand($ont))
                ) MAXDEPTH ${MAX_NEIGHBORS})
        `;
        return { query, params };
    }
    return Subquery.parse({ ...opt, target: model.name, filters: subContainsClause(['name']) }).toString(paramIndex, prefix);
};


class FixedSubquery {
    constructor(queryType, queryBuilder, opt = {}) {
        this.queryType = queryType;
        this.queryBuilder = queryBuilder;
        this.opt = opt;
        this.isSubquery = true;
    }

    expectedCount() { return null; }  // eslint-disable-line

    toString(paramIndex = 0, prefix = '') {
        const query = this.queryBuilder({ ...this.opt, paramIndex, prefix: prefix || this.opt.prefix });
        return query;
    }

    static parse({ queryType, ...opt }) {
        if (queryType === 'ancestors') {
            return new this(queryType, ancestors, opt);
        } if (queryType === 'descendants') {
            return new this(queryType, descendants, opt);
        } if (queryType === 'neighborhood') {
            return new this(queryType, neighborhood, opt);
        } if (queryType === 'similarTo') {
            return new this(queryType, similarTo, opt);
        } if (queryType === 'keyword') {
            return new this(queryType, keywordSearch, opt);
        }
        throw new AttributeError(`Unrecognized query type (${queryType}) expected one of [ancestors, descendants, neighborhood, similarTo]`);
    }
}


module.exports = { FixedSubquery };
