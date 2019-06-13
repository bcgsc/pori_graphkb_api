/**
 * Complex statement queries, optimized
 * @module app/repo/query/statement
 */
const {util: {castToRID}, error: {AttributeError}, schema: SCHEMA_DEFN} = require('@bcgsc/knowledgebase-schema');

const {
    MAX_TRAVEL_DEPTH, MAX_NEIGHBORS
} = require('./constants');
const {generateSqlParams} = require('./util');
const {Traversal} = require('./traversal');


/**
 * Subquery to gather similar ontology terms starting with some list of current terms
 */
const similarFromRidList = (params, {prefix = ''} = {}) => {
    const initialVertices = `[${params.map(p => `:${p}`).join(', ')}]`;
    const disambiguationClause = cond => `TRAVERSE both('AliasOf', 'DeprecatedBy', 'CrossReferenceOf') FROM ${cond} MAXDEPTH ${MAX_NEIGHBORS}`;
    // disambiguate
    const query = `SELECT expand($${prefix}Result)
        LET $${prefix}Initial = (${disambiguationClause(initialVertices)}),
        $${prefix}Ancestors = (TRAVERSE in('SubClassOf') FROM $${prefix}Initial MAXDEPTH ${MAX_TRAVEL_DEPTH}),
        $${prefix}Descendants = (TRAVERSE out('SubClassOf') FROM $${prefix}Initial MAXDEPTH ${MAX_TRAVEL_DEPTH}),
        $${prefix}Union = UNIONALL($${prefix}Ancestors, $${prefix}Descendants),
        $${prefix}Result = (${disambiguationClause(`$${prefix}Union`)})`;

    // filter duplicates and re-expand
    // const query = `SELECT expand(rid) FROM (SELECT distinct(@rid) as rid FROM (${innerQuery}))`;
    return query;
};


/**
 * Adds count/skip/ordering information to the queries
 */
const postConditionalQueryOptions = (innerQuery, opt) => {
    const {
        skip = 0,
        orderBy,
        orderByDirection = 'ASC',
        count = false
    } = opt;
    let query = innerQuery;

    if (orderBy) {
        try {
            orderBy.map(orderProp => Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Statement, orderProp));
        } catch (err) {
            throw new AttributeError(`Invalid orderBy (${orderBy.join(', ')}) ${err}`);
        }

        query = `${query} ORDER BY ${orderBy.map(param => `${param} ${orderByDirection}`).join(', ')}`;
    }
    if (count) {
        query = `SELECT count(*) from (${query})`;
    } else if (skip && skip > 0) {
        query = `${query} SKIP ${skip}`;
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
        impliedBy = [],
        relevance = [],
        appliesTo = [],
        createdBy = [],
        reviewedBy = [],
        source = [],
        evidenceLevel = []
    } = opt;
    const ridList = new Set();
    for (const list of [impliedBy, relevance, createdBy, reviewedBy, source, evidenceLevel, appliesTo]) {
        for (let index = 0; index < list.length; index++) {
            list[index] = castToRID(list[index]).toString(); // normalize keys
            ridList.add(list[index].toString()); // ignore dups for param names
        }
    }
    const params = generateSqlParams(Array.from(ridList), 0);
    // search the impliedBy relationships
    const subqueries = {};

    const pickParamNames = list => Object.entries(params).map(([key, value]) => (list.includes(value)
        ? key
        : null)).filter(k => k !== null);

    if (relevance.length) {
        subqueries.$relevance = `SELECT * FROM Statement WHERE relevance IN (SELECT * FROM (${similarFromRidList(pickParamNames(relevance), {prefix: 'relevance'})}))`;
    }
    if (impliedBy.length) {
        subqueries.$impliedBy = `SELECT expand(inE('ImpliedBy').outV()) FROM (${similarFromRidList(pickParamNames(impliedBy), {prefix: 'implied'})})`;
    }

    if (appliesTo.length) {
        subqueries.$appliesTo = `SELECT * FROM Statement WHERE appliesTo IN (SELECT * FROM (${similarFromRidList(pickParamNames(relevance), {prefix: 'appliesTo'})}))`;
    }

    let query;
    if (Object.keys(subqueries).length) {
        query = `SELECT * FROM (SELECT expand($result)
            LET ${Object.entries(subqueries).map(([name, subquery]) => `${name} = (${subquery}),`).join('\n ')}
                $result = INTERSECT(${Object.keys(subqueries).join(', ')}))`;
    } else {
        query = 'SELECT * FROM Statement';
    }

    const where = [];
    const directLinks = {
        source, createdBy, reviewedBy, evidenceLevel
    };

    for (const [linkName, rids] of Object.entries(directLinks)) {
        if (rids.length) {
            where.push(`${linkName} IN [${pickParamNames(rids).map(p => `:${p}`).join(', ')}]`);
        }
    }

    if (where.length) {
        query += ` WHERE ${where.join(' AND ')}`;
    }

    // cast the input ids
    for (const key of Object.keys(params)) {
        params[key] = castToRID(params[key]);
    }
    query = postConditionalQueryOptions(query, opt);
    return {query, params};
};


/**
 * For the GUI to speed up the main search query until we can migrate to v3 odb
 */
const keywordSearch = (keywordsIn, opt) => {
    const params = {};
    const paramMapping = {};

    // remove any duplicate words
    const keywords = Array.from(new Set(keywordsIn.map(word => word.trim().toLowerCase())));

    for (const keyword of keywords) {
        const pname = `param${Object.keys(params).length}`;
        params[pname] = keyword;
        paramMapping[keyword] = pname;
    }

    const subContainsClause = (props) => {
        const whereClause = [];
        // must contains all words but words can exist in any prop
        for (const keyword of keywords) {
            const orClause = [];
            for (const prop of props) {
                orClause.push(`${prop} CONTAINSTEXT :${paramMapping[keyword]}`);
            }
            let inner = orClause.join(' OR ');

            if (orClause.length > 1) {
                inner = `(${inner})`;
            }
            whereClause.push(inner);
        }
        return whereClause.join(' AND ');
    };

    let query = `
    SELECT expand(uniqueRecs) FROM (
        SELECT distinct(@rid) as uniqueRecs FROM (
            SELECT expand($v)
            LET $ont = (SELECT * from Ontology WHERE ${
    subContainsClause(['sourceId', 'name'])
}),
                $variants = (SELECT * FROM Variant WHERE ${
    subContainsClause([
        'type.name',
        'type.sourceId',
        'reference1.name',
        'reference1.sourceId',
        'reference2.name',
        'reference2.sourceId'
    ])
}),
                $implicable = (SELECT expand(inE('ImpliedBy').outV()) from (select expand(UNIONALL($ont, $variants)))),
                $statements = (SELECT * FROM Statement WHERE ${
    subContainsClause([
        'appliesTo.name',
        'appliesTo.sourceId',
        'relevance.name',
        'relevance.sourceId'
    ])
}),
                $v = UNIONALL($statements, $implicable)
        ) WHERE deletedAt IS NULL
    )`;
    query = postConditionalQueryOptions(query, opt);
    return {query, params};
};


module.exports = {
    searchByLinkedRecords, keywordSearch, similarFromRidList, postConditionalQueryOptions
};
