/**
 * Create neighborhood queries where some conditions are loosely matched and then expanded to
 * surrounding verticies
 */
/**
 * @constant
 * @ignore
 */
const {
    util: { castToRID, looksLikeRID },
    error: { AttributeError }, schema: { schema },
} = require('@bcgsc/knowledgebase-schema');
const {
    variant: { parse: parseVariant },
    error: { ParsingError },
} = require('@bcgsc/knowledgebase-parser');
const { quoteWrap } = require('./../util');

const {
    MAX_TRAVEL_DEPTH, MAX_NEIGHBORS, DEFAULT_NEIGHBORS, OPERATORS, MIN_WORD_SIZE, SIMILARITY_EDGES, TREE_EDGES,
} = require('./constants');
const { castRangeInt } = require('./util');


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
    return { params, query: statement };
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
    return { params, query: statement };
};


const recordsAsTarget = (...target) => `[${target.map(p => castToRID(p).toString()).join(', ')}]`;


const similarTo = ({
    target, prefix = '', history = false, paramIndex = 0, edges = SIMILARITY_EDGES, treeEdges = TREE_EDGES, matchType, ...rest
} = {}) => {
    // TODO: Move back to using substitution params pending: https://github.com/orientechnologies/orientjs/issues/376
    let initialQuery,
        params = {};

    for (const edge of [...treeEdges, ...edges]) {
        if (!schema[edge]) {
            throw new AttributeError(`unrecognized edge class (${edge})`);
        }
    }

    if (!edges.length) {
        throw new AttributeError('Must specify 1 or more edge types to follow');
    }
    if (Object.keys(rest).length) {
        throw new AttributeError(`unrecognized arguments (${Object.keys(rest).join(', ')})`);
    }
    if (Array.isArray(target)) {
        initialQuery = recordsAsTarget(...target);
    } else {
        const { query: initialStatement, params: initialParams } = target.toString(paramIndex, prefix);

        initialQuery = `(${initialStatement})`; // recordIdList is a subquery instead of a list of record IDs
        params = { ...initialParams };
    }

    const treeEdgeStrings = treeEdges.map(e => `'${e}'`).join(', ');

    const disambiguationClause = cond => `TRAVERSE both(${edges.map(e => `'${e}'`).join(', ')}) FROM ${cond} MAXDEPTH ${MAX_NEIGHBORS}`;
    // disambiguate

    let innerQuery;

    if (treeEdges.length) {
        innerQuery = `SELECT expand($${prefix}Result)
            LET $${prefix}Initial = (${disambiguationClause(initialQuery)}),
            $${prefix}Ancestors = (TRAVERSE in(${treeEdgeStrings}) FROM (SELECT expand($${prefix}Initial)) MAXDEPTH ${MAX_TRAVEL_DEPTH}),
            $${prefix}Descendants = (TRAVERSE out(${treeEdgeStrings}) FROM (SELECT expand($${prefix}Initial)) MAXDEPTH ${MAX_TRAVEL_DEPTH}),
            $${prefix}Union = (SELECT expand(UNIONALL($${prefix}Ancestors, $${prefix}Descendants))),
            $${prefix}Result = (${disambiguationClause(`(SELECT expand($${prefix}Union))`)})`;
    } else {
        innerQuery = `SELECT expand($${prefix}Result)
            LET $${prefix}Result = (${disambiguationClause(initialQuery)})`;
    }

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
    return { params, query };
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

const buildLooseSearch = (cls, name) => ({
    queryType: 'similarTo',
    target: {
        filters: {
            OR: [
                { name },
                { sourceId: name },
            ],
        },
        target: cls,
    },
});


const buildHgvsQuery = (hgvsInput) => {
    const parsed = parseVariant(hgvsInput);
    const payload = {
        filters: {
            AND: [
                {
                    reference1: buildLooseSearch('Feature', parsed.reference1),
                },
                {
                    type: buildLooseSearch('Vocabulary', parsed.type),
                },
            ],
        },
        target: 'PositionalVariant',
    };

    if (parsed.reference2) {
        payload.filters.AND.push(buildLooseSearch(parsed.reference2));
    } else {
        payload.filters.AND.push({ reference2: null });
    }

    // sequence property filters
    for (const name of ['refSeq', 'untemplatedSeq', 'untemplatedSeqSize']) {
        if (parsed[name] !== undefined) {
            const filters = {
                OR: [
                    { [name]: parsed[name] },
                    { [name]: null },
                ],
            };

            if (name !== 'untemplatedSeqSize') {
                filters.OR.push({ [name]: 'x'.repeat(parsed[name].length) });
            }
            payload.filters.AND.push(filters);
        }
    }

    // position property filters
    for (const breakProp of ['break1', 'break2']) {
        const start = `${breakProp}Start`,
            end = `${breakProp}End`;

        if (!parsed[start]) {
            continue;
        }
        payload.filters.AND.push({
            [`${start}.@class`]: parsed[start].toJSON()['@class'],
        });

        if (parsed[start].pos !== undefined) { // ignore cytoband positions for now
            if (parsed[end]) {
                payload.filters.AND.push({
                    OR: [
                        {
                            AND: [ // range vs single
                                { [`${start}.pos`]: parsed[start].pos, operator: OPERATORS.LTE },
                                { [`${start}.pos`]: parsed[end].pos, operator: OPERATORS.GTE },
                                { [`${end}.pos`]: null },
                            ],
                        },
                        {
                            AND: [ // range vs range
                                { [`${end}.pos`]: parsed[start].pos, operator: OPERATORS.LTE },
                                { [`${start}.pos`]: parsed[end].pos, operator: OPERATORS.GTE },
                            ],
                        },
                    ],
                });
            } else {
                payload.filters.AND.push({
                    OR: [
                        {
                            AND: [ // single vs single
                                { [`${start}.pos`]: parsed[start].pos },
                                { [`${end}.pos`]: null },
                            ],
                        },
                        {
                            AND: [ // single vs range
                                { [`${end}.pos`]: parsed[start].pos, operator: OPERATORS.LTE },
                                { [`${start}.pos`]: parsed[start].pos, operator: OPERATORS.GTE },
                            ],
                        },
                    ],
                });
            }
        }
    }

    return payload;
};


const singleKeywordSearch = ({
    target,
    param,
    prefix = '',
    operator = OPERATORS.CONTAINSTEXT,
    targetQuery,
    ...opt
}) => {
    const model = schema[target];

    if (model.inherits.includes('Ontology') || model.name === 'Ontology' || model.name === 'Evidence') {
        return `SELECT *
        FROM ${targetQuery || model.name}
        WHERE name ${operator} :${param}
            OR sourceId ${operator} :${param}`;
    } if (model.name === 'Statement') {
        const ontologySubq = singleKeywordSearch({
            ...opt,
            operator,
            param,
            prefix: `${prefix}ontologySubq`,
            target: 'Ontology',
        });

        const variantSubq = singleKeywordSearch({
            ...opt,
            operator,
            param,
            prefix: `${prefix}variantSubq`,
            target: 'Variant',
        });

        const query = `SELECT expand($${prefix}statements)
            LET $${prefix}ont = (
                    ${ontologySubq}
                ),
                $${prefix}variants = (
                    ${variantSubq}
                ),
                $${prefix}implicable = (SELECT expand(UNIONALL($${prefix}ont, $${prefix}variants))),
                $${prefix}statements = (
                    SELECT *
                    FROM ${targetQuery || model.name}
                    WHERE
                        conditions CONTAINSANY (SELECT expand($${prefix}implicable))
                        OR evidence CONTAINSANY (SELECT expand($${prefix}ont))
                        OR evidenceLevel CONTAINSANY (SELECT expand($${prefix}ont))
                        OR subject IN (SELECT expand($${prefix}implicable))
                        OR relevance IN (SELECT expand($${prefix}ont))
                )
        `;
        return query;
    } if (model.inherits.includes('Variant') || model.name === 'Variant') {
        const subquery = singleKeywordSearch({
            ...opt,
            operator,
            param,
            prefix: `${prefix}ontologySubq`,
            target: 'Ontology',
        });

        return `SELECT expand($${prefix}variants)
            LET $${prefix}ont = (
                ${subquery}
            ),
                $${prefix}variants = (
                    SELECT *
                    FROM ${targetQuery || model.name}
                    WHERE
                        type IN (SELECT expand($${prefix}ont))
                        OR reference1 IN (SELECT expand($${prefix}ont))
                        OR reference2 IN (SELECT expand($${prefix}ont))
                )
        `;
    }
    return `SELECT *
    FROM ${targetQuery || model.name}
    WHERE name ${operator} :${param}`;
};


const keywordSearch = ({
    target,
    keyword,
    paramIndex,
    prefix = '',
    operator = OPERATORS.CONTAINSTEXT,
    subQueryParser,
    ...opt
}) => {
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

    if (wordList.length < 1) {
        throw new AttributeError('missing keywords');
    }
    const keywords = Array.from(new Set(wordList)).filter(k => k);

    const params = {};

    if (keywords.length === 1) {
        const [word] = keywords;

        if (looksLikeRID(word)) {
            return { params: {}, query: `SELECT FROM ${recordsAsTarget(word)}` };
        } if (target.endsWith('Variant')) {
            try {
                return subQueryParser(
                    buildHgvsQuery(word),
                ).toString(
                    paramIndex, prefix,
                );
            } catch (err) {
                if (!(err instanceof ParsingError)) {
                    throw err;
                }
            }
        }
    }

    let query;

    keywords.forEach((word, wordIndex) => {
        const param = `${prefix}param${wordIndex}`;
        query = singleKeywordSearch({
            ...opt,
            operator: keyword.length >= MIN_WORD_SIZE
                ? operator
                : OPERATORS.EQ,
            param,
            prefix: `${prefix}w${wordIndex}`,
            subQueryParser,
            target: model.name,
            targetQuery: query
                ? `(${query})`
                : null,
        });
        params[param] = word;
    });

    return { params, query: `SELECT DISTINCT * FROM (${query})` };
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
        const query = this.queryBuilder({
            ...this.opt, paramIndex, prefix: prefix || this.opt.prefix,
        });
        return query;
    }

    static parse({ queryType, ...opt }, subQueryParser) {
        if (queryType === 'ancestors') {
            return new this(queryType, ancestors, opt);
        } if (queryType === 'descendants') {
            return new this(queryType, descendants, opt);
        } if (queryType === 'neighborhood') {
            return new this(queryType, neighborhood, opt);
        } if (queryType === 'similarTo') {
            return new this(queryType, similarTo, opt);
        } if (queryType === 'keyword') {
            return new this(queryType, keywordSearch, { ...opt, subQueryParser });
        }
        throw new AttributeError(`Unrecognized query type (${queryType}) expected one of [ancestors, descendants, neighborhood, similarTo]`);
    }
}


module.exports = { FixedSubquery };
