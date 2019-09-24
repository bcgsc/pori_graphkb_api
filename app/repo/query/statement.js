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
    SELECT ${DEFAULT_PROJECTION} FROM (
            SELECT expand($statements)
            LET $ont = (SELECT * from Ontology WHERE ${
    subContainsClause(['sourceId', 'name'])
}),
                $variants = (SELECT * FROM Variant WHERE type IN (SELECT expand($ont)) OR reference1 in (SELECT expand($ont)) OR reference2 IN (SELECT expand($ont))),
                $implicable = (SELECT expand(UNIONALL($ont, $variants))),
                $statements = (SELECT * FROM Statement
                    WHERE
                        impliedBy CONTAINSANY (SELECT expand($implicable))
                        OR supportedBy CONTAINSANY (SELECT expand($ont))
                        OR appliesTo IN (SELECT expand($implicable))
                        OR relevance IN (SELECT expand($ont))
                )
        )${
    activeOnly
        ? 'WHERE deletedAt IS NULL'
        : ''
}`;
    query = postConditionalQueryOptions(query, rest);
    return {query, params};
};


module.exports = {
    keywordSearch
};
