/**
 * GRAPH TRAVERSAL FUNCTIONS
 */

const { logger } = require('../logging');
const {
    DEFAULT_EDGES,
    DEFAULT_EDGE_PROPERTIES,
    DEFAULT_NODE_PROPERTIES,
    DEFAULT_TREEEDGES,
    MAX_DEPTH,
} = require('./constants');
const { buildTraverseExpr } = require('./util');

/**
 * composition queries
 * Given an ontology class, returns all nodes (ontology) and ontology-connected edges (edges + treeEdges).
 *
 * In lieu of a traversal, select queries are performed on all classes individually, then combined.
 * Query pagination is used since it can be data intensive.
 *
 * @param {Object} db - The database session object
 * @param {string} ontology - The ontology class
 * @param {Object} opt
 * @returns {Map<string, Object>} records - The selected records, mapped by RID
 */
const composition = async (db, ontology, opt = {}) => {
};

/**
 * similarity traversal
 * Given an ontology class and a base to start from, follows similarity Edges (edges) in both directions.
 * Returns the traversed nodes and edges.
 *
 * @param {Object} db - The database session object
 * @param {string} ontology - The ontology class
 * @param {Array.<string>} base - Record RIDs to start traversing from
 * @param {Object} opt
 * @param {Array.<string>} [opt.edges=DEFAULT_EDGES] - Similarity edge classes
 * @param {number} [opt.maxDepth=MAX_DEPTH] - The maximum traversal depth
 * @param {Array.<string>} [opt.returnEdgeProperties=DEFAULT_EDGE_PROPERTIES]
 * @param {Array.<string>} [opt.returnNodeProperties=DEFAULT_NODE_PROPERTIES]
 * @returns {Map<string, Object>} records - The selected records, mapped by RID
 */
const similarity = async (
    db,
    ontology,
    base,
    opt = {},
) => {
    // options
    const {
        edges = DEFAULT_EDGES,
        maxDepth = MAX_DEPTH,
        returnEdgeProperties = DEFAULT_EDGE_PROPERTIES,
        returnNodeProperties = DEFAULT_NODE_PROPERTIES,
    } = opt;

    // queryString
    const queryString = `
        SELECT
            ${[...new Set([...returnEdgeProperties, ...returnNodeProperties])].join(',')}
        FROM (
            TRAVERSE
                ${buildTraverseExpr({ edges, treeEdges: [] })}
            FROM
                [${base.join(',')}]
            WHILE
                @class in [${[...edges, ontology].map((x) => `'${x}'`).join(',')}] AND
                (in.@class is null OR in.@class = '${ontology}') AND
                (out.@class is null OR out.@class = '${ontology}') AND
                deletedAt is null AND
                $depth <= ${maxDepth}
        )`;
    logger.debug(queryString);

    // query
    const results = await db.query(queryString).all();

    const records = new Map(results.map((r) => [String(r['@rid']), r]));
    logger.debug(`results: ${records.size}`);
    return records;
};

/**
 * immediate traversal
 * Given an ontology class, a base to start from and a direction (ascending|descending),
 * follows similarity edges (edges) in both directions and hierarchy edges (treeEdges)
 * in the given direction for 1 generation.
 * Returns the traversed nodes and edges.
 *
 * Done in 3 steps:
 * 1. Get base similarity
 * 2. From there, get children or parents (1 generation)
 * 3. From there, get similarity again
 *
 * @param {Object} db - The database session object
 * @param {string} ontology - The ontology class to be traversed
 * @param {Array.<string>} base
 * @param {string} direction - The traversal direction (ascending|descending)
 * @param {Object} opt
 * @param {Array.<string>} [opt.edges=DEFAULT_EDGES] - Similarity edge classes
 * @param {number} [opt.maxDepth=MAX_DEPTH] - The maximum traversal depth
 * @param {Array.<string>} [opt.returnEdgeProperties=DEFAULT_EDGE_PROPERTIES]
 * @param {Array.<string>} [opt.returnNodeProperties=DEFAULT_NODE_PROPERTIES]
 * @param {Array.<string>} [opt.treeEdges=DEFAULT_TREEEDGES] - Hierarchy edge classes
 * @returns {Map<string, Object>} records - The selected records, mapped by RID
 */
const immediate = async (
    db,
    ontology,
    base,
    direction,
    opt = {},
) => {
    // options
    const {
        edges = DEFAULT_EDGES,
        maxDepth = MAX_DEPTH,
        returnEdgeProperties = DEFAULT_EDGE_PROPERTIES,
        returnNodeProperties = DEFAULT_NODE_PROPERTIES,
        treeEdges = DEFAULT_TREEEDGES,
    } = opt;

    // 1st traversal; get base similarity
    const t1 = await similarity(
        db,
        ontology,
        base,
        {
            edges,
            maxDepth,
            returnEdgeProperties,
            returnNodeProperties,
        },
    );

    // 2nd traversal; get 1st generation (children|parents)
    const queryString = `
        SELECT
            ${[...new Set([...returnEdgeProperties, ...returnNodeProperties])].join(',')}
        FROM (
            TRAVERSE
                ${buildTraverseExpr({ direction, edges: [], treeEdges })}
            FROM
                [${[...t1.keys()].join(',')}]
            WHILE
                @class in [${[...edges, ...treeEdges, ontology].map((x) => `'${x}'`).join(',')}] AND
                (in.@class is null OR in.@class = '${ontology}') AND
                (out.@class is null OR out.@class = '${ontology}') AND
                deletedAt is null AND
                $depth <= 1
        )`;
    logger.debug(queryString);
    const results = await db.query(queryString).all();
    const t2 = new Map(results.map((r) => [String(r['@rid']), r]));
    logger.debug(`results: ${t2.size}`);

    // 3rd traversal; get similarity again
    const t3 = await similarity(
        db,
        ontology,
        [...t2.keys()], // base
        {
            edges,
            maxDepth,
            returnEdgeProperties,
            returnNodeProperties,
        },
    );

    // concatenated results
    const records = new Map([...t1, ...t2, ...t3]);
    logger.debug(`concatenated results: ${records.size}`);
    return records;
};

/**
 * transitive traversal
 * Given an ontology class, a base to start from and a direction (ascending|descending),
 * follows similarity edges (edges) in both directions and hierarchy edges (treeEdges)
 * in the given direction for all generations.
 * Returns the traversed nodes and edges.
 *
 * @param {Object} db - The database session object
 * @param {string} ontology - The ontology class to be traversed
 * @param {Array.<string>} base
 * @param {string} direction - The traversal direction (ascending|descending)
 * @param {Object} opt
 * @param {Array.<string>} [opt.edges=DEFAULT_EDGES] - Similarity edge classes
 * @param {number} [opt.maxDepth=MAX_DEPTH] - The maximum traversal depth
 * @param {Array.<string>} [opt.returnEdgeProperties=DEFAULT_EDGE_PROPERTIES]
 * @param {Array.<string>} [opt.returnNodeProperties=DEFAULT_NODE_PROPERTIES]
 * @param {Array.<string>} [opt.treeEdges=DEFAULT_TREEEDGES] - Hierarchy edge classes
 * @returns {Map<string, Object>} records - The selected records, mapped by RID
 */
const transitive = async (
    db,
    ontology,
    base,
    direction,
    opt = {},
) => {
    // options
    const {
        edges = DEFAULT_EDGES,
        maxDepth = MAX_DEPTH,
        returnEdgeProperties = DEFAULT_EDGE_PROPERTIES,
        returnNodeProperties = DEFAULT_NODE_PROPERTIES,
        treeEdges = DEFAULT_TREEEDGES,
    } = opt;

    // queryString
    const queryString = `
        SELECT
            ${[...new Set([...returnEdgeProperties, ...returnNodeProperties])].join(',')}
        FROM (
            TRAVERSE
                ${buildTraverseExpr({ direction, edges, treeEdges })}
            FROM
                [${base.join(',')}]
            WHILE
                @class in [${[...edges, ...treeEdges, ontology].map((x) => `'${x}'`).join(',')}] AND
                (in.@class is null OR in.@class = '${ontology}') AND
                (out.@class is null OR out.@class = '${ontology}') AND
                deletedAt is null AND
                $depth <= ${maxDepth}
        )`;

    // query
    logger.debug(queryString);
    const results = await db.query(queryString).all();
    const records = new Map(results.map((r) => [String(r['@rid']), r]));
    logger.debug(`results: ${records.size}`);
    return records;
};
};

module.exports = {
    composition,
    immediate,
    similarity,
    transitive,
};
