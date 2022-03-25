/**
 * Create neighborhood queries where some conditions are loosely matched and then expanded to
 * surrounding vertices
 */
import * as gkbSchema from '@bcgsc-pori/graphkb-schema';
const {
    util: { castToRID, looksLikeRID },
    error: { AttributeError }, schema,
} = gkbSchema;
import {
    parseVariant,
    ParsingError
} from '@bcgsc-pori/graphkb-parser';
import { quoteWrap } from '../util';

import { MAX_TRAVEL_DEPTH, MAX_NEIGHBORS, DEFAULT_NEIGHBORS, OPERATORS, MIN_WORD_SIZE, SIMILARITY_EDGES, TREE_EDGES } from './constants';
import { castRangeInt } from './util';
import { BuiltQuery, isSubquery, QueryBase } from '../../types';
import { GraphRecordId } from '@bcgsc-pori/graphkb-schema/dist/constants';

const disambiguationClause = (cond: string, edges: string[] = [...SIMILARITY_EDGES]) => `TRAVERSE both(${edges.map((e) => `'${e}'`).join(', ')}) FROM ${cond} MAXDEPTH ${MAX_NEIGHBORS}`;

/**
 * @param {Object} opt options
 * @param {Clause} opt.filters the conditions of the match
 * @param {string} opt.target the name of the starting model
 * @param {Number} opt.paramIndex the starting index to use in naming parameter aliases
 * @param {Array.<string>} opt.edges list of edge class names to follow in creating the neighborhood
 * @param {string} opt.direction the direction to follow (in/out)
 */
const treeQuery = (opt: {
    filters: QueryBase;
    depth?: number;
    edges?: string[];
    paramIndex?: number;
    direction: 'in' | 'out' | 'both',
    target: string | string[] | QueryBase;
    history?: boolean;
    disambiguate?: boolean;
}): BuiltQuery => {
    const {
        filters, target: rawTarget, paramIndex = 0, direction, history = false, disambiguate = true,
    } = opt;
    const edges = opt.edges || ['SubclassOf'];
    const depth = castRangeInt(opt.depth || MAX_TRAVEL_DEPTH, 1, MAX_TRAVEL_DEPTH);

    let params = {},
        target = rawTarget;

    if (Array.isArray(rawTarget)) {
        target = `[${rawTarget.map(castToRID).map((rid) => rid.toString()).join(', ')}]`;
    } else if (isSubquery(target)) {
        const { query, params: whereParams } = filters.toString(paramIndex);
        target = `(SELECT * FROM ${target} WHERE ${query})`;
        params = whereParams;
    } else if (target !== 'string' || !schema.has(target)) {
        throw new AttributeError(`Invalid target class (${target})`);
    }

    if (!['out', 'in'].includes(direction)) {
        throw new AttributeError(`direction (${direction}) must be in or out`);
    }

    if (disambiguate) {
        target = `(${disambiguationClause(target, [...SIMILARITY_EDGES])})`;
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
}): BuiltQuery => {
    // check the edges are valid edge names
    for (const edge of edges) {
        if (!schema.get(edge)) {
            throw new AttributeError(`Invalid edge parameter (${edge})`);
        }
    }

    if (!schema.has(target)) {
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

const recordsAsTarget = (...target) => `[${target.map((p) => castToRID(p).toString()).join(', ')}]`;

const similarTo = (opt: {
    target: string[] | GraphRecordId[] | QueryBase;
    prefix?: string;
    history?: boolean;
    paramIndex?: number;
    edges?: string[];
    treeEdges: string[];
    matchType?: string;
}): BuiltQuery => {
    // TODO: Move back to using substitution params pending: https://github.com/orientechnologies/orientjs/issues/376
    const {
        target,
        prefix = '',
        history = false,
        paramIndex = 0,
        edges = [...SIMILARITY_EDGES],
        treeEdges = [...TREE_EDGES],
        matchType, ...rest
    } = opt;
    let initialQuery,
        params = {};

    for (const edge of [...treeEdges, ...edges]) {
        if (!schema.has(edge)) {
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
        if (!schema.has(matchType)) {
            throw new AttributeError(`Did not recognize type matchType (${matchType})`);
        }
        if (!history) {
            query = `SELECT * FROM (${query}) WHERE deletedAt IS NULL AND @this INSTANCEOF ${schema.get(matchType).name}`;
        } else {
            query = `SELECT * FROM (${query}) WHERE @this INSTANCEOF ${schema.get(matchType).name}`;
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
const ancestors = (opt): BuiltQuery => {
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
const descendants = (opt): BuiltQuery => {
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

const buildHgvsQuery = (hgvsInput: string) => {
    const parsed = parseVariant(hgvsInput);
    const filters: { AND: unknown[] } = {
        AND: [
            {
                reference1: buildLooseSearch('Feature', parsed.reference1),
            },
            {
                type: buildLooseSearch('Vocabulary', parsed.type),
            },
        ],
    };

    if (parsed.reference2) {
        filters.AND.push(buildLooseSearch('Feature', parsed.reference2));
    } else {
        filters.AND.push({ reference2: null });
    }

    // sequence property filters
    for (const name of ['refSeq', 'untemplatedSeq', 'untemplatedSeqSize']) {
        if (parsed[name] !== undefined) {
            const propFilters = {
                OR: [
                    { [name]: parsed[name] },
                    { [name]: null },
                ],
            };

            if (name !== 'untemplatedSeqSize') {
                propFilters.OR.push({ [name]: 'x'.repeat(parsed[name].length) });
            }
            filters.AND.push(filters);
        }
    }

    // position property filters
    for (const breakProp of ['break1', 'break2']) {
        const start = `${breakProp}Start`,
            end = `${breakProp}End`;

        if (!parsed[start]) {
            continue;
        }
        filters.AND.push({
            [`${start}.@class`]: parsed[start].toJSON()['@class'],
        });

        if (parsed[start].pos !== undefined) { // ignore cytoband positions for now
            if (parsed[end]) {
                filters.AND.push({
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
                filters.AND.push({
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

    return {
        filters,
        target: 'PositionalVariant',
    };
};

const singleKeywordSearch = ({
    target,
    param,
    prefix = '',
    operator = OPERATORS.CONTAINSTEXT,
    targetQuery,
    ...opt
}: {
    target: string;
    param: string;
    prefix?: string;
    operator?: string;
    targetQuery?: string | null;
    [key: string]: unknown;
}) => {
    const model = schema.models[target];

    if (model.name === 'EvidenceLevel') {
        return `SELECT *
        FROM ${targetQuery || model.name}
        WHERE name ${operator} :${param}
            OR sourceId ${operator} :${param}
            OR source.name ${operator} :${param}`;
    } if (model.inherits.includes('Ontology') || model.name === 'Ontology' || model.name === 'Evidence') {
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
        throw new AttributeError('edge query must be filtered by a vertex');
    }
    if (!['out', 'in', 'both'].includes(direction)) {
        throw new AttributeError(`direction (${direction}) must be one of: in, out, both`);
    }
    if (!schema.has(target) || !schema.get(target).isEdge) {
        throw new AttributeError(`target (${target}) must be an edge class`);
    }

    try {
        const rid = castToRID(vertexFilter);
        return {
            params: {},
            query: `SELECT expand(${direction}E('${target}')) FROM [${rid}]`,
        };
    } catch (err) { }

    if (Array.isArray(vertexFilter)) {
        try {
            const rid = vertexFilter.map(castToRID);
            return {
                params: {},
                query: `SELECT expand(${direction}E('${target}')) FROM [${rid.join(', ')}]`,
            };
        } catch (err) { }
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
    const wordList: string[] = operator === OPERATORS.CONTAINSTEXT
        ? keyword.split(/\s+/).map((word) => word.trim().toLowerCase())
        : [keyword.trim().toLowerCase()];

    if (wordList.length < 1) {
        throw new AttributeError('missing keywords');
    }
    const keywords = Array.from(new Set(wordList)).filter((k) => k).sort();

    const params = {};

    if (keywords.length === 1) {
        const [word] = keywords;

        if (looksLikeRID(word)) {
            return { params: {}, query: `SELECT FROM ${recordsAsTarget(word)}` };
        } if (target.endsWith('Variant')) {
            try {
                return subQueryParser(
                    buildHgvsQuery(word),
                ).toString(paramIndex, prefix);
            } catch (err) {
                if (!(err instanceof ParsingError)) {
                    throw err;
                }
            }
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

class FixedSubquery implements QueryBase {
    queryType: string;
    queryBuilder: (arg0: Record<string, unknown>) => { query: string; params: Record<string, unknown> };
    opt: Record<string, unknown>;
    isSubquery: true;

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
}

export { FixedSubquery, ancestors, descendants, neighborhood, similarTo, keywordSearch, edgeQuery };
