/**
 * Create neighborhood queries where some conditions are loosely matched and then expanded to
 * surrounding verticies
 */
/**
 * @constant
 * @ignore
 */
const {
    util,
    ValidationError, schema: schemaDefn,
} = require('@bcgsc-pori/graphkb-schema');
const {
    parseVariant,
    ParsingError,
} = require('@bcgsc-pori/graphkb-parser');
const { quoteWrap } = require('../util');

const {
    MAX_TRAVEL_DEPTH,
    MAX_NEIGHBORS,
    DEFAULT_NEIGHBORS,
    OPERATORS,
    MIN_WORD_SIZE,
    SIMILARITY_EDGES,
    TREE_EDGES,
} = require('./constants');
const { castRangeInt } = require('./util');

const disambiguationClause = (cond, edges = SIMILARITY_EDGES) => `TRAVERSE both(${edges.map((e) => `'${e}'`).join(', ')}) FROM ${cond} MAXDEPTH ${MAX_NEIGHBORS}`;

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
        filters, target: rawTarget, paramIndex = 0, direction, history = false, disambiguate = true,
    } = opt;
    const edges = opt.edges || ['SubclassOf'];
    const depth = castRangeInt(opt.depth || MAX_TRAVEL_DEPTH, 1, MAX_TRAVEL_DEPTH);

    let params = {},
        target = rawTarget;

    if (Array.isArray(rawTarget)) {
        target = `[${rawTarget.map(util.castToRID).map((rid) => rid.toString()).join(', ')}]`;
    } else if (schemaDefn.has(target) === undefined) {
        throw new ValidationError(`Invalid target class (${target})`);
    } else {
        const { query, params: whereParams } = filters.toString(paramIndex);
        target = `(SELECT * FROM ${target} WHERE ${query})`;
        params = whereParams;
    }

    if (!['out', 'in'].includes(direction)) {
        throw new ValidationError(`direction (${direction}) must be in or out`);
    }

    if (disambiguate) {
        target = `(${disambiguationClause(target, SIMILARITY_EDGES)})`;
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
        if (!schemaDefn.get(edge)) {
            throw new ValidationError(`Invalid edge parameter (${edge})`);
        }
    }

    if (!schemaDefn.has(target)) {
        throw new ValidationError(`Invalid target class (${target})`);
    }
    const depth = castRangeInt(depthIn || DEFAULT_NEIGHBORS, 0, MAX_NEIGHBORS);

    const { query, params } = filters.toString(paramIndex);
    const statement = `SELECT * FROM (MATCH
    {class: ${target}, WHERE: (${query})}
        .both(${edges.map(quoteWrap).join(', ')}){WHILE: ($depth < ${depth})}
RETURN DISTINCT $pathElements)`;
    return { params, query: statement };
};

const recordsAsTarget = (...target) => `[${target.map((p) => util.castToRID(p).toString()).join(', ')}]`;

const similarTo = ({
    target, prefix = '', history = false, paramIndex = 0, edges = SIMILARITY_EDGES, treeEdges = TREE_EDGES, matchType, ...rest
} = {}) => {
    // TODO: Move back to using substitution params pending: https://github.com/orientechnologies/orientjs/issues/376
    let initialQuery,
        params = {};

    for (const edge of [...treeEdges, ...edges]) {
        if (!schemaDefn.has(edge)) {
            throw new ValidationError(`unrecognized edge class (${edge})`);
        }
    }

    if (!edges.length) {
        throw new ValidationError('Must specify 1 or more edge types to follow');
    }
    if (Object.keys(rest).length && !(Object.keys(rest).length === 1 && rest.limit)) {
        throw new ValidationError(`unrecognized arguments (${Object.keys(rest).join(', ')})`);
    }
    if (Array.isArray(target)) {
        initialQuery = recordsAsTarget(...target);
    } else {
        const { query: initialStatement, params: initialParams } = target.toString(paramIndex, prefix);

        initialQuery = `(${initialStatement})`; // recordIdList is a subquery instead of a list of record IDs
        params = { ...initialParams };
    }

    const treeEdgeStrings = treeEdges.map((e) => `'${e}'`).join(', ');

    // disambiguate

    let innerQuery;

    if (treeEdges.length) {
        innerQuery = `SELECT expand($${prefix}Result)
            LET $${prefix}Initial = (${disambiguationClause(initialQuery, edges)}),
            $${prefix}Ancestors = (TRAVERSE in(${treeEdgeStrings}) FROM (SELECT expand($${prefix}Initial)) MAXDEPTH ${MAX_TRAVEL_DEPTH}),
            $${prefix}Descendants = (TRAVERSE out(${treeEdgeStrings}) FROM (SELECT expand($${prefix}Initial)) MAXDEPTH ${MAX_TRAVEL_DEPTH}),
            $${prefix}Union = (SELECT expand(UNIONALL($${prefix}Ancestors, $${prefix}Descendants))),
            $${prefix}Result = (${disambiguationClause(`(SELECT expand($${prefix}Union))`, edges)})`;
    } else {
        innerQuery = `SELECT expand($${prefix}Result)
            LET $${prefix}Result = (${disambiguationClause(initialQuery, edges)})`;
    }

    // filter duplicates and re-expand
    let query = `SELECT expand(rid) FROM (SELECT distinct(@rid) as rid FROM (${innerQuery}))`;

    if (matchType) {
        if (!schemaDefn.has(matchType)) {
            throw new ValidationError(`Did not recognize type matchType (${matchType})`);
        }
        if (!history) {
            query = `SELECT * FROM (${query}) WHERE deletedAt IS NULL AND @this INSTANCEOF ${schemaDefn.get(matchType).name}`;
        } else {
            query = `SELECT * FROM (${query}) WHERE @this INSTANCEOF ${schemaDefn.get(matchType).name}`;
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

/**
 * Used to be called from within keywordSearch() but removed by KBDEV-1124
 * Keeping the function for legacy
 */
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
            [`${start}.@class`]: parsed[start]['@class'],
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
    limit,
    ...opt
}) => {
    const model = schemaDefn.get(target);

    if (model.name === 'EvidenceLevel') {
        return `SELECT *
        FROM ${targetQuery || model.name}
        WHERE name ${operator} :${param}
            OR sourceId ${operator} :${param}
            OR source.name ${operator} :${param}
            OR displayName.toLowerCase() ${operator} :${param}`;
    } if (schemaDefn.inheritsFrom(model.name, 'Ontology') || model.name === 'Ontology' || model.name === 'Evidence') {
        return `SELECT *
        FROM ${targetQuery || model.name}
        WHERE name.asString() ${operator} :${param}
            OR sourceId.asString() ${operator} :${param}
        LIMIT ${limit}`;
    } if (model.name === 'Statement') {
        const ontologySubq = singleKeywordSearch({
            limit,
            ...opt,
            operator,
            param,
            prefix: `${prefix}ontologySubq`,
            target: 'Ontology',
        });

        const variantSubq = singleKeywordSearch({
            limit,
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
    } if (schemaDefn.inheritsFrom(model.name, 'Variant') || model.name === 'Variant') {
        const subqueryFeature = singleKeywordSearch({
            limit,
            ...opt,
            operator,
            param,
            prefix: `${prefix}ontologySubq`,
            target: 'Feature',
        });
        const subqueryVocab = singleKeywordSearch({
            limit,
            ...opt,
            operator,
            param,
            prefix: `${prefix}ontologySubq`,
            target: 'Vocabulary',
        });

        return `SELECT expand($${prefix}variants)
            LET $${prefix}ontFeature = (
                ${subqueryFeature}
            ),
            $${prefix}ontVocab = (
                ${subqueryVocab}
            ),
                $${prefix}variants = (
                    SELECT *
                    FROM ${targetQuery || model.name}
                    WHERE
                        type IN (SELECT expand($${prefix}ontVocab))
                        OR reference1 IN (SELECT expand($${prefix}ontFeature))
                        OR reference2 IN (SELECT expand($${prefix}ontFeature))
                        OR displayName.toLowerCase() ${operator} :${param}
                    LIMIT ${limit}
                )
        `;
    }
    return `SELECT *
    FROM ${targetQuery || model.name}
    WHERE name ${operator} :${param}`;
};

const edgeQuery = ({
    target,
    vertexFilter,
    subQueryParser,
    direction = 'both',
    paramIndex = 0,
    prefix = '',
}) => {
    // if either filter.in or filter.out is given use those
    if (!vertexFilter) {
        throw new ValidationError('edge query must be filtered by a vertex');
    }
    if (!['out', 'in', 'both'].includes(direction)) {
        throw new ValidationError(`direction (${direction}) must be one of: in, out, both`);
    }
    if (!schemaDefn.has(target) || !schemaDefn.get(target).isEdge) {
        throw new ValidationError(`target (${target}) must be an edge class`);
    }

    try {
        const rid = util.castToRID(vertexFilter);
        return {
            params: {},
            query: `SELECT expand(${direction}E('${target}')) FROM [${rid}]`,
        };
    } catch (err) {}

    if (Array.isArray(vertexFilter)) {
        try {
            const rid = vertexFilter.map(util.castToRID);
            return {
                params: {},
                query: `SELECT expand(${direction}E('${target}')) FROM [${rid.join(', ')}]`,
            };
        } catch (err) {}
    }
    // subquery
    const subquery = subQueryParser(vertexFilter).toString(paramIndex, prefix);
    return {
        params: subquery.params,
        query: `SELECT expand(${direction}E('${target}')) FROM (${subquery.query})`,
    };
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
    const model = schemaDefn.get(target);

    if (![OPERATORS.CONTAINSTEXT, OPERATORS.EQ].includes(operator)) {
        throw new ValidationError(`Invalid operator (${operator}). Keyword search only accepts = or CONTAINSTEXT`);
    }
    if (model.isEdge) {
        throw new ValidationError(`Cannot keyword search edge classes (${target})`);
    }

    if (!keyword) {
        throw new ValidationError('Missing required keyword parameter');
    }

    // remove any duplicate words
    const wordList = operator === OPERATORS.CONTAINSTEXT
        ? keyword.split(/\s+/).map((word) => word.trim().toLowerCase())
        : [keyword.trim().toLowerCase()];

    if (wordList.length < 1) {
        throw new ValidationError('missing keywords');
    }
    const keywords = Array.from(new Set(wordList)).filter((k) => k).sort();

    const params = {};

    if (keywords.length === 1) {
        const [word] = keywords;

        if (util.looksLikeRID(word)) {
            return { params: {}, query: `SELECT FROM ${recordsAsTarget(word)}` };
        }
    }

    let query;

    keywords.forEach((word, wordIndex) => {
        const param = `${prefix}param${paramIndex}w${wordIndex}`;
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

    return { params, query: `SELECT DISTINCT * FROM (${query}) WHERE deletedAt IS NULL` };
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
        } if (queryType === 'edge') {
            return new this(queryType, edgeQuery, { ...opt, subQueryParser });
        }
        throw new ValidationError(`Unrecognized query type (${queryType}) expected one of [ancestors, descendants, neighborhood, similarTo]`);
    }
}

module.exports = { FixedSubquery };
