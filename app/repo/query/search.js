/**
 * Complex statement queries, optimized
 * @module app/repo/query/statement
 */
const {util: {castToRID}, error: {AttributeError: ValidationError}, schema: SCHEMA_DEFN} = require('@bcgsc/knowledgebase-schema');

const {
    MAX_TRAVEL_DEPTH, MAX_NEIGHBORS, DEFAULT_STATEMENT_PROJECTION
} = require('./constants');
const {reverseDirection} = require('./util');

const {Traversal} = require('./traversal');

const SIMILARITY_EDGES = [
    'AliasOf',
    'ElementOf',
    'CrossReferenceOf',
    'DeprecatedBy',
    'GeneralizationOf',
    'Infers'
];


/**
 * Adds count/skip/ordering information to the queries
 */
const postConditionalQueryOptions = (innerQuery, opt) => {
    const {
        skip = 0,
        orderBy,
        orderByDirection = 'ASC',
        count = false,
        model,
        limit
    } = opt;
    let query = innerQuery;

    if (orderBy) {
        try {
            orderBy.map(orderProp => Traversal.parse(SCHEMA_DEFN.schema, model, orderProp));
        } catch (err) {
            throw new ValidationError(`Invalid orderBy (${orderBy.join(', ')}) ${err}`);
        }

        query = `${query} ORDER BY ${orderBy.map(param => `${param} ${orderByDirection}`).join(', ')}`;
    }
    if (count) {
        query = `SELECT count(*) from (${query})`;
    } else if (skip && skip > 0) {
        query = `${query} SKIP ${skip}`;
    }
    if (limit) {
        query = `${query} LIMIT ${limit}`;
    }
    return query;
};

/**
 * Subquery to gather similar ontology terms starting with some list of current terms
 */
const similarFromRidList = (recordIdList, {prefix = '', activeOnly = true} = {}) => {
    // TODO: Move back to using substitution params pending: https://github.com/orientechnologies/orientjs/issues/376
    let initialSelection;
    if (Array.isArray(recordIdList)) {
        initialSelection = `[${recordIdList.map(p => castToRID(p).toString()).join(', ')}]`;
    } else {
        initialSelection = `(${recordIdList})`; // recordIdList is a subquery instead of a list of record IDs
    }
    const disambiguationClause = cond => `TRAVERSE both(${SIMILARITY_EDGES.map(e => `'${e}'`).join(', ')}) FROM ${cond} MAXDEPTH ${MAX_NEIGHBORS}`;
    // disambiguate
    const innerQuery = `SELECT expand($${prefix}Result)
        LET $${prefix}Initial = (${disambiguationClause(initialSelection)}),
        $${prefix}Ancestors = (TRAVERSE in('SubClassOf') FROM (SELECT expand($${prefix}Initial)) MAXDEPTH ${MAX_TRAVEL_DEPTH}),
        $${prefix}Descendants = (TRAVERSE out('SubClassOf') FROM (SELECT expand($${prefix}Initial)) MAXDEPTH ${MAX_TRAVEL_DEPTH}),
        $${prefix}Union = (SELECT expand(UNIONALL($${prefix}Ancestors, $${prefix}Descendants))),
        $${prefix}Result = (${disambiguationClause(`(SELECT expand($${prefix}Union))`)})`;

    // filter duplicates and re-expand
    const query = `SELECT expand(rid) FROM (SELECT distinct(@rid) as rid FROM (${innerQuery}))`;
    if (activeOnly) {
        return `SELECT * FROM (${query}) WHERE deletedAt IS NULL`;
    }
    return query;
};


const edgeSubquery = (edge, recordIdList, {activeOnly = true} = {}) => {
    // TODO: Move back to using substitution params pending: https://github.com/orientechnologies/orientjs/issues/376
    const recordsIds = recordIdList.map(r => castToRID(r).toString());
    const subquery = similarFromRidList(recordsIds, {prefix: edge, activeOnly});

    const match = /^(out|in)_(\S+)$/.exec(edge);
    if (!match) {
        throw new ValidationError(`Edge name (${edge}) is not a valid edge traversal`);
    }
    const [, direction, edgeClass] = match;
    const edgeModel = SCHEMA_DEFN.get(edgeClass);

    const query = `SELECT expand(${reverseDirection(direction)}E('${edgeModel.name}').outV()) FROM (${subquery})`;
    if (activeOnly) {
        return `SELECT * FROM (${query}) WHERE deletedAt IS NULL`;
    }
    return query;
};


/**
 * optimized and simplified statement seatching query
 *
 * @param {object} opt the query options
 * @param {Array.<string>} opt.impliedBy array of record Ids
 * @param {Array.<string>} opt.relevance array of record Ids
 * @param {Array.<string>} opt.appliesTo array of record Ids
 * @param {Array.<string>} opt.createdBy array of User record Ids
 * @param {Array.<string>} opt.source array of Source record Ids
 * @param {Array.<string>} opt.evidenceLevel array of EvidenceLevel record Ids
 * @param {Number} opt.skip the number of records to skip (for paginating)
 * @param {Array.<string>} opt.orderBy the properties used to determine the sort order of the results
 * @param {string} opt.orderByDirection the direction to order (ASC or DESC)
 * @param {boolean} opt.count count the records instead of returning them
 */
const searchByLinkedRecords = (opt) => {
    const {
        model,
        filters = {},
        activeOnly = true
    } = opt;
    const projection = opt.projection || (model.name === 'Statement'
        ? DEFAULT_STATEMENT_PROJECTION
        : '*, *:{@rid, @class, displayName}');

    const {queryProperties} = model;

    const edgeQueries = {};
    const sqlParams = {};

    const aliasParameter = (value) => {
        const key = `param${Object.keys(sqlParams).length}`;
        sqlParams[key] = value;
        return key;
    };

    const clauses = [];

    for (const fieldName of Object.keys(filters)) {
        // separate edge queries
        const values = filters[fieldName];
        const propModel = queryProperties[fieldName];
        // attr in (SUBQUERY) for links and intersect() > 1 for iterable properties
        if (propModel) {
            // direct attr
            if (propModel.type.startsWith('link')) {
                if (!propModel.iterable) {
                    // single link
                    clauses.push(`${fieldName} IN (${similarFromRidList(values, {prefix: fieldName, activeOnly})})`);
                } else {
                    // set of links
                    clauses.push(`intersect(${fieldName}, (${similarFromRidList(values, {prefix: fieldName, activeOnly})})).size() > 0`);
                }
            } else if (propModel.iterable) {
                // Positive intersection of lists
                const paramKey = aliasParameter(propModel.validate(values));
                clauses.push(`intersect(${fieldName}, :${paramKey}).size() > 0`);
            } else {
                // in any of the items from the list
                const paramKeys = values.map(v => aliasParameter(propModel.validate(v)));
                clauses.push(`${fieldName} in [${paramKeys.map(p => `:${p}`).join(', ')}]`);
            }
        } else if (fieldName.startsWith('out_') || fieldName.startsWith('in_')) {
            try {
                edgeQueries[fieldName] = edgeSubquery(fieldName, values, {activeOnly});
            } catch (err) {
                throw new ValidationError(`Edge fields (${fieldName}) must be given a list of record IDs (${err})`);
            }
        } else {
            throw new ValidationError(`Invalid search parameter (${fieldName})`);
        }
    }
    const traversesEdges = Object.keys(edgeQueries).length;

    let queryBase = `SELECT * FROM ${model.name}`;

    if (clauses.length > 0) {
        queryBase = `${queryBase} WHERE ${clauses.join(' AND ')}`;
        if (traversesEdges) {
            edgeQueries.queryBase = queryBase;
        }
    }

    let query;

    if (traversesEdges) {
        // must do the intersect all wrapper
        if (Object.keys(edgeQueries).length > 1) {
            query = `SELECT expand($result)
                LET ${Object.keys(edgeQueries).map(k => `$${k} = (${edgeQueries[k]})`).join(', ')},
                    $result = intersect(${Object.keys(edgeQueries).map(k => `$${k}`).join(', ')})`;
        } else {
            query = Object.values(edgeQueries)[0];
        }
    } else {
        query = queryBase;
    }
    // wrap the 'disambiguate' for the top-level
    query = `SELECT ${projection} FROM (${similarFromRidList(query, {prefix: 'topLevel', activeOnly})})`;
    if (activeOnly) {
        query = `SELECT * FROM (${query}) WHERE deletedAt IS NULL`;
    }
    query = postConditionalQueryOptions(query, opt);
    return {query, params: sqlParams};
};


module.exports = {
    searchByLinkedRecords,
    edgeSubquery,
    similarFromRidList,
    SIMILARITY_EDGES,
    postConditionalQueryOptions
};
