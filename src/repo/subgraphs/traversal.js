/**
 * GRAPH TRAVERSAL FUNCTIONS
 */

const { ValidationError } = require('@bcgsc-pori/graphkb-schema');

const { logger } = require('../logging');
const {
    DEFAULT_EDGES,
    DEFAULT_PROPERTIES,
    DEFAULT_TREEEDGES,
    MAX_DEPTH,
} = require('./constants');
const {
    baseValidation,
    buildTraverseExpr,
    getAdjacency,
    getComponents,
    getGraph,
    getPropsPerClass,
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
 * @param {Array.<string>} [opt.returnProperties=DEFAULT_PROPERTIES]
 * @param {Array.<string>} [opt.treeEdges=DEFAULT_TREEEDGES] - Hierarchy edge classes
 * @returns {Map<string, Object>} records - The selected records, mapped by RID
 */
const composition = async (db, ontology, opt = {}) => {
    // options
    const {
        edges = DEFAULT_EDGES,
        returnProperties = DEFAULT_PROPERTIES,
        treeEdges = DEFAULT_TREEEDGES,
    } = opt;

    // QUERIES
    const records = new Map();

    // ontology Nodes query
    const ontologyRecords = await queryWithPagination(
        db,
        `SELECT
            ${returnProperties.join(',')}
        FROM
            :ontology
        WHERE
            deletedAt is null`,
        { params: { ontology } },
    );
    ontologyRecords.forEach((r) => records.set(String(r['@rid']), r));

    // edges & treeEdges Edges queries
    const edgeClasses = [...edges, ...treeEdges];

    for (let i = 0; i < edgeClasses.length; i++) {
        const EdgeClassRecords = await queryWithPagination(
            db,
            `SELECT
                ${returnProperties.join(',')}
            FROM
                ${edgeClasses[i]}
            WHERE
                deletedAt is null AND
                in.@class = :ontology AND
                in.deletedAt is null AND
                out.@class = :ontology AND
                out.deletedAt is null`,
            { params: { ontology } },
        );
        EdgeClassRecords.forEach((r) => records.set(String(r['@rid']), r));
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
 * @param {Array.<string>} [opt.returnProperties=DEFAULT_PROPERTIES]
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
        returnProperties = DEFAULT_PROPERTIES,
    } = opt;

    // traverse expression w/ params
    const { expr, params: tParams } = buildTraverseExpr({ edges, treeEdges: [] });

    // queryString & params
    const queryString = `
        SELECT
            ${returnProperties.join(',')}
        FROM (
            TRAVERSE
                ${expr}
            FROM
                [${base.join(',')}]
            WHILE
                @class IN :cls AND
                (in.@class is null OR in.@class = :ontology) AND
                (out.@class is null OR out.@class = :ontology) AND
                deletedAt is null AND
                $depth <= :depth
        )`;
    logger.debug(queryString);
    const params = {
        params: {
            cls: [...edges, ontology],
            depth: maxDepth, // important renaming of maxDepth
            ontology,
            ...tParams,
        },
    };
    logger.debug(JSON.stringify(params));

    // query
    const results = await db.query(queryString, params).all();

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
 * @param {Array.<string>} base - Record RIDs to start traversing from
 * @param {string} direction - The traversal direction (ascending|descending)
 * @param {Object} opt
 * @param {Array.<string>} [opt.edges=DEFAULT_EDGES] - Similarity edge classes
 * @param {number} [opt.maxDepth=MAX_DEPTH] - The maximum traversal depth
 * @param {Array.<string>} [opt.returnProperties=DEFAULT_PROPERTIES]
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
        returnProperties = DEFAULT_PROPERTIES,
        treeEdges = DEFAULT_TREEEDGES,
    } = opt;

    // 1st TRAVERSAL; get base similarity
    const t1 = await similarity(
        db,
        ontology,
        base,
        {
            edges,
            maxDepth,
            returnProperties,
        },
    );

    // 2nd TRAVERSAL; get 1st generation (children|parents)
    // traverse expression w/ params
    const { expr, params: tParams } = buildTraverseExpr({ direction, edges: [], treeEdges });
    // base; node records from 1st traversal
    const t2Base = Array.from(t1.entries())
        .filter(([, v]) => v['@class'] === ontology)
        .map((x) => x[0]) // RID
        .join(',');
    // queryString & params
    const queryString = `
        SELECT
            ${returnProperties.join(',')}
        FROM (
            TRAVERSE
                ${expr}
            FROM
                [${t2Base}]
            WHILE
                @class IN :cls AND
                (in.@class is null OR in.@class = :ontology) AND
                (out.@class is null OR out.@class = :ontology) AND
                deletedAt is null AND
                $depth <= 1
        )`;
    logger.debug(queryString);
    const params = {
        params: {
            cls: [...edges, ontology],
            ontology,
            ...tParams,
        },
    };
    logger.debug(JSON.stringify(params));
    // query & results
    const results = await db.query(queryString, params).all();
    const t2 = new Map(results.map((r) => [String(r['@rid']), r]));
    logger.debug(`results: ${t2.size}`);

    // 3rd TRAVERSAL; get similarity again
    // base; node records from 2nd traversal
    const t3Base = Array.from(t2.entries())
        .filter(([, v]) => v['@class'] === ontology)
        .map((x) => x[0]); // RID
    // traversal
    const t3 = await similarity(
        db,
        ontology,
        t3Base, // base
        {
            edges,
            maxDepth,
            returnProperties,
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
 * @param {Array.<string>} base - Record RIDs to start traversing from
 * @param {string} direction - The traversal direction (ascending|descending)
 * @param {Object} opt
 * @param {Array.<string>} [opt.edges=DEFAULT_EDGES] - Similarity edge classes
 * @param {number} [opt.maxDepth=MAX_DEPTH] - The maximum traversal depth
 * @param {Array.<string>} [opt.returnProperties=DEFAULT_PROPERTIES]
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
        returnProperties = DEFAULT_PROPERTIES,
        treeEdges = DEFAULT_TREEEDGES,
    } = opt;

    // traverse expression w/ params
    const { expr, params: tParams } = buildTraverseExpr({ direction, edges, treeEdges });

    // queryString & params
    const queryString = `
        SELECT
            ${returnProperties.join(',')}
        FROM (
            TRAVERSE
                ${expr}
            FROM
                [${base.join(',')}]
            WHILE
                @class in :cls AND
                (in.@class is null OR in.@class = :ontology) AND
                (out.@class is null OR out.@class = :ontology) AND
                deletedAt is null AND
                $depth <= :depth
        )`;
    logger.debug(queryString);
    const params = {
        params: {
            cls: [...edges, ...treeEdges, ontology],
            depth: maxDepth, // important renaming of maxDepth
            ontology,
            ...tParams,
        },
    };
    logger.debug(JSON.stringify(params));

    // query
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
 * @param {Array.<string>} [opt.returnProperties=DEFAULT_PROPERTIES]
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
        returnProperties = DEFAULT_PROPERTIES,
        subgraph = 'real',
        treeEdges = DEFAULT_TREEEDGES,
        vOpt = {},
    } = {},
) => {
    // INPUTS
    // a valid base is required for most traversals
    if (!base) {
        if (direction !== 'both') {
            throw new ValidationError(`
                Some base records (base parameter) are required to perform the traversal from.
            `);
        }
    } else {
        await baseValidation(db, ontology, base);
    }

    // Make sure minimal default properties are present/added
    // All user-defined returnProperties are additions to defaults
    DEFAULT_PROPERTIES.forEach((x) => {
        if (!returnProperties.includes(x)) {
            returnProperties.push(x);
        }
    });
    // Make sure all returnProperties are valid.
    // Needed for both SQL sanitation and properties filtering on query results.
    const propsPerClass = getPropsPerClass([...edges, ...treeEdges, ontology], returnProperties);

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
                        returnProperties,
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
                        returnProperties,
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
                    returnProperties,
                    treeEdges,
                },
            );
            results.forEach((v, k) => { records.set(k, v); });
            break;

        case 'split':
            // tree-like subgraph. Direction is splitted from base
            // 1. TRANSITIVE directed traversal for ancestors
            results = await transitive(
                db,
                ontology,
                base,
                'ascending', // direction
                {
                    edges,
                    maxDepth,
                    returnProperties,
                    treeEdges,
                },
            );
            results.forEach((v, k) => { records.set(k, v); });

            // 2. TRANSITIVE directed traversal for descendants
            results = await transitive(
                db,
                ontology,
                base,
                'descending', // direction
                {
                    edges,
                    maxDepth,
                    returnProperties,
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
                    returnProperties,
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
        propsPerClass,
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
