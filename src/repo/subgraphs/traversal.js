/**
 * GRAPH TRAVERSAL FUNCTIONS
 */

const { ValidationError } = require('@bcgsc-pori/graphkb-schema');

const { logger } = require('../logging');
const {
    DEFAULT_EDGES,
    DEFAULT_EDGE_PROPERTIES,
    DEFAULT_NODE_PROPERTIES,
    DEFAULT_TREEEDGES,
    MAX_DEPTH,
} = require('./constants');
const {
    baseValidation,
    buildTraverseExpr,
    getAdjacency,
    getComponents,
    getGraph,
    queryWithPagination,
} = require('./util');
const { virtualize } = require('./virtual');

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
 * @param {Array.<string>} [opt.edges=DEFAULT_EDGES] - Similarity edge classes
 * @param {Array.<string>} [opt.returnEdgeProperties=DEFAULT_EDGE_PROPERTIES]
 * @param {Array.<string>} [opt.returnNodeProperties=DEFAULT_NODE_PROPERTIES]
 * @param {Array.<string>} [opt.treeEdges=DEFAULT_TREEEDGES] - Hierarchy edge classes
 * @returns {Map<string, Object>} records - The selected records, mapped by RID
 */
const composition = async (db, ontology, opt = {}) => {
    // options
    const {
        edges = DEFAULT_EDGES,
        returnEdgeProperties = DEFAULT_EDGE_PROPERTIES,
        returnNodeProperties = DEFAULT_NODE_PROPERTIES,
        treeEdges = DEFAULT_TREEEDGES,
    } = opt;

    // QUERIES
    const records = new Map();

    // ontology Nodes query
    const queryStringOntology = `
        SELECT
            ${returnNodeProperties.join(',')}
        FROM
            ${ontology}
        WHERE
            deletedAt is null`;
    const ontologyRecords = await queryWithPagination(db, queryStringOntology);

    // populating records
    for (const r of ontologyRecords) {
        records.set(String(r['@rid']), r);
    }

    // edges & treeEdges Edges queries
    const edgeClasses = [...edges, ...treeEdges];

    for (let i = 0; i < edgeClasses.length; i++) {
        const queryStringEdgeClass = `
            SELECT
                ${returnEdgeProperties.join(',')}
            FROM
                ${edgeClasses[i]}
            WHERE
                deletedAt is null AND
                in.@class = '${ontology}' AND
                in.deletedAt is null AND
                out.@class = '${ontology}' AND
                out.deletedAt is null`;

        const EdgeClassRecords = await queryWithPagination(db, queryStringEdgeClass);

        // populating records
        for (const r of EdgeClassRecords) {
            records.set(String(r['@rid']), r);
        }
    }

    logger.debug(`results: ${records.size}`);
    return records;
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

/**
 * traverse
 * Given an ontology class, some base records and a direction,
 * traverse a graph and return a subgraph.
 * Both a 'real' subgraph (g) and/or a simplified virtual subgraph (v) can be returned.
 *
 * direction:
 * - null: Follow edges (similarity) in both directions for all generations.
 * - 'ascending': Follow edges (similarity) in both directions and treeEdges (hierarchy)
 *                 in the given direction for 1 (parents) or all (ancestors) generations.
 * - 'descending': Follow edges (similarity) in both directions and treeEdges (hierarchy)
 *                 in the given direction for 1 (children) or all (descendants) generations.
 * - 'both': Instead of a traversal, select queries are performed on the ontology class and
 *           all Edge classes individually, then combined.
 *
 * subgraph:
 *   - 'real': The subgraph is returned as a real graph
 *   - 'virtual': The subgraph is returned as a virtual graph
 *   - 'both': The subgraph is returned in both formats
 *
 * @param {Object} db - The database session object
 * @param {string} ontology - The ontology class to perform the graph traversal on
 * @param {Object} [opt={}]
 * @param {Array.<string>|null} [opt.base=null] - Record RIDs to start traversing from
 * @param {string|null} [opt.direction=null] - Hierarchy edges traversal direction
 * @param {Array.<string>} [opt.edges=DEFAULT_EDGES] - Similarity edge classes
 * @param {boolean} [opt.firstGenerationOnly=false] - Limits hierarchy TreeEdges traversal depth to 1
 * @param {number} [opt.maxDepth=MAX_DEPTH] - The maximum traversal depth on a traversal path
 * @param {Array.<string>} [opt.returnEdgeProperties=DEFAULT_EDGE_PROPERTIES]
 * @param {Array.<string>} [opt.returnNodeProperties=DEFAULT_NODE_PROPERTIES]
 * @param {boolean} [opt.subgraph='real'] - Returned subgraph format(s)
 * @param {Array.<string>} [opt.treeEdges=DEFAULT_TREEEDGES] - Hierarchy edge classes
 * @param {Object} [vOpt={}] - Virtualization options
 * @returns {Object} result
 *   @property {Object} [result.g] - The subgraph
 *   @property {Object} [result.v] - A virtualized version of the subgraph
 */
const traverse = async (
    db,
    ontology,
    {
        base = null,
        direction = null,
        edges = DEFAULT_EDGES,
        firstGenerationOnly = false,
        maxDepth = MAX_DEPTH,
        returnEdgeProperties = DEFAULT_EDGE_PROPERTIES, // Has no effect on a virtual subgraph
        returnNodeProperties = DEFAULT_NODE_PROPERTIES, // On a virtual subgraph, only affect associated records
        subgraph = 'real',
        treeEdges = DEFAULT_TREEEDGES,
        vOpt = {},
    } = {},
) => {
    // INPUTS
    // a valid base is required for most traversals
    if (!base && direction !== 'both') {
        throw new ValidationError(`
            Some base records (base parameter) are required to perform the traversal from.
            Consider a complete queryType to traverse the whole ${ontology} ontology.
        `);
    }
    await baseValidation(db, ontology, base);

    // make sure minimal default properties are present/added
    DEFAULT_EDGE_PROPERTIES.forEach((x) => {
        if (!returnEdgeProperties.includes(x)) {
            returnEdgeProperties.push(x);
        }
    });
    DEFAULT_NODE_PROPERTIES.forEach((x) => {
        if (!returnNodeProperties.includes(x)) {
            returnNodeProperties.push(x);
        }
    });

    // additional checks
    if (typeof maxDepth !== 'number' || maxDepth === 0) {
        // eslint-disable-next-line no-param-reassign
        maxDepth = MAX_DEPTH;
    }

    // TRAVERSAL
    let results;
    const records = new Map();

    switch (direction) {
        case 'ascending':
        case 'descending':
            if (firstGenerationOnly) {
                // IMMEDIATE directed traversal; for parent|children
                results = await immediate(
                    db,
                    ontology,
                    base,
                    direction,
                    {
                        edges,
                        maxDepth,
                        returnEdgeProperties,
                        returnNodeProperties,
                        treeEdges,
                    },
                );
                results.forEach((v, k) => { records.set(k, v); });
            } else {
                // TRANSITIVE directed traversal; for ancestors|descendants
                results = await transitive(
                    db,
                    ontology,
                    base,
                    direction,
                    {
                        edges,
                        maxDepth,
                        returnEdgeProperties,
                        returnNodeProperties,
                        treeEdges,
                    },
                );
                results.forEach((v, k) => { records.set(k, v); });
            }
            break;

        case 'both':
            // COMPOSITION query to get the entire graph
            results = await composition(
                db,
                ontology,
                {
                    edges,
                    returnEdgeProperties,
                    returnNodeProperties,
                    treeEdges,
                },
            );
            results.forEach((v, k) => { records.set(k, v); });
            break;

        case 'split':
            // tree-like subgraph. Direction is splitted from base
            // TRANSITIVE directed traversal for ancestors
            results = await transitive(
                db,
                ontology,
                base,
                'ascending', // direction
                {
                    edges,
                    maxDepth,
                    returnEdgeProperties,
                    returnNodeProperties,
                    treeEdges,
                },
            );
            results.forEach((v, k) => { records.set(k, v); });

            // TRANSITIVE directed traversal for descendants
            // duplicates need to be addressed downstream
            results = await transitive(
                db,
                ontology,
                base,
                'descending', // direction
                {
                    edges,
                    maxDepth,
                    returnEdgeProperties,
                    returnNodeProperties,
                    treeEdges,
                },
            );
            results.forEach((v, k) => { records.set(k, v); });
            logger.debug(`concatenated results: ${records.size}`);
            break;

        default: // direction = null
            // SIMILARITY traversal
            results = await similarity(
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
            results.forEach((v, k) => { records.set(k, v); });
            break;
    }

    // OUTPUT
    const output = {};

    // Real graph
    // Formatting records into a graph structure (segregated nodes & edges)
    const graph = getGraph(records, {
        edgeClasses: [...edges, ...treeEdges],
        nodeClasses: [ontology],
        returnEdgeProperties,
        returnNodeProperties,
    });
    logger.debug(`g: { edges: ${graph.edges.size}, nodes: ${graph.nodes.size} }`);

    if (subgraph !== 'virtual') {
        // nodes & edges
        output.g = {
            edges: Object.fromEntries(graph.edges), // serializable obj.
            nodes: Object.fromEntries(graph.nodes), // serializable obj.
        };

        // Adjacency list
        const adj = getAdjacency(graph);

        output.g.adjacency = Object.fromEntries(
            Array.from(adj, ([key, set]) => [key, Array.from(set)]), // serializable obj.
        );
        logger.debug(`g: { adjacency: ${adj.size} }`);

        // Connected components
        output.g.components = getComponents(adj);
        logger.debug(`g: { components: ${output.g.components.length} }`);
    }

    // Virtual graph
    // Generating a virtual simplification of the real graph
    if (subgraph === 'virtual' || subgraph === 'both') {
        output.v = virtualize(graph, { ...vOpt, edges, treeEdges });
    }

    return output;
};

module.exports = {
    composition,
    immediate,
    similarity,
    transitive,
    traverse,
};
