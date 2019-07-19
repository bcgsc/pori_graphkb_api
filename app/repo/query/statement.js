/**
 * Complex statement queries, optimized
 * @module app/repo/query/statement
 */
const {
    DEFAULT_PROJECTION
} = require('./constants');
const {postConditionalQueryOptions} = require('./search');


/**
 * For the GUI to speed up the main search query until we can migrate to v3 odb
 */
const keywordSearch = (keywordsIn, opt = {}) => {
    const {activeOnly = true, ...rest} = opt;
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
    SELECT ${DEFAULT_PROJECTION} FROM (SELECT expand(uniqueRecs) FROM (
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
                $v = (SELECT expand(UNIONALL($statements, $implicable)))
        ) WHERE deletedAt IS NULL
    ))`;
    query = postConditionalQueryOptions(query, opt);
    return {query, params};
};


module.exports = {
    keywordSearch
};
