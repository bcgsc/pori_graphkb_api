/* eslint-disable no-constant-condition */
/**
 * SUBGRAPHS UTILITY FUNCTIONS
 */

const _ = require('lodash');

const {
    schema: { models, subclassMapping },
    ValidationError,
    util: { looksLikeRID },
} = require('@bcgsc-pori/graphkb-schema');
const { logger } = require('../logging');
const {
    DEFAULT_DIRECTIONS,
    DEFAULT_EDGE_PROPERTIES,
    DEFAULT_NODE_PROPERTIES,
    DEFAULT_EDGES,
    DEFAULT_TREEEDGES,
    MAX_SIZE,
    PAGE_SIZE,
} = require('./constants');

/**
 * Given a class name, returns all inheriting classes (from schema)
 *
 * @param {string} [superCls='V'] - The class acting as super class
 * @param {Object} [opt={}]
 * @param {boolean} [opt.includeAbstractCls=false] - Including abstract classes in the returned classes
 * @param {boolean} [opt.includeSuperCls=false] - Including the super class in the returned classes
 * @returns {Array.<string>} classes - An array of class names
 */
const getInheritingClasses = (superCls = 'V', {
    includeAbstractCls = false,
    includeSuperCls = false,
} = {}) => {
    const classes = [];

    // Recursively get all inherited classes
    const getMapping = (cls) => {
        if (subclassMapping[cls]) {
            subclassMapping[cls].forEach((x) => {
                classes.push(x);
                return getMapping(x);
            });
        }
    };
    getMapping(superCls);

    // Including the super class itself
    if (includeSuperCls) {
        classes.push(superCls);
    }

    // Discarding abstract classes, if any
    if (!includeAbstractCls) {
        return classes.filter((x) => !models[x].isAbstract);
    }
    return classes;
};

/**
 * Given an array of RIDs, returns an array of distinct classes these records belong to.
 *
 * @param {Object} db - The database session object
 * @param {Array.<string>} rids - Some record RIDs
 * @returns {Array.<string>} classes - The corresponding classes
 */
const getClasses = async (db, rids) => {
    const queryString = `
        SELECT
            DISTINCT(@class)
        FROM
            [${rids.join(',')}]
        WHERE
            deletedAt is null`;

    logger.debug(queryString);
    const records = await db.query(queryString).all();

    return records.map((x) => x['@class']);
};

/**
 * Given an array of RIDs, returns false is some are inactive or non-existent,
 * otherwise true.
 *
 * @param {Object} db - The database session object
 * @param {Array.<string>} rids - Some record RIDs
 * @returns {boolean}
 */
const areActiveRIDs = async (db, rids) => {
    const ids = [...new Set(rids)];
    const queryString = `
        SELECT
            @rid,
            deletedAt
        FROM [${ids.join(',')}]`;

    logger.debug(queryString);
    const records = await db.query(queryString).all();

    return ids.length === records.filter((x) => x.deletedAt === null).length;
};

/**
 * Given an ontology class and a base of record RIDs, check if these RIDs are valid,
 * active records (not soft-deleted), that all belong to the given ontology class.
 * Throw an error if not.
 *
 * @param {Object} db - The database session object
 * @param {string} ontology - The ontology class
 * @param {Array.<string>|any} base - The base record RIDs to validate
 */
const baseValidation = async (db, ontology, base) => {
    if (!base) { return; } // skip base validation if base is null

    // Check format
    if (Array.isArray(base)) {
        if (base.length === 0) {
            throw new ValidationError('base parameter must not be an empty array.');
        }
        base.forEach((rid) => {
            if (!looksLikeRID(rid)) {
                throw new ValidationError(`${rid} is not a valid base RID`);
            }
        });
    } else {
        throw new ValidationError('base parameter must be an array of RID strings.');
    }

    // Check if all RIDs belong to records of the given ontology class
    const baseClasses = await getClasses(db, base);

    if (baseClasses.length !== 1 || baseClasses[0] !== ontology) {
        throw new ValidationError(`
            All base records must be records of the targetted ontology class (${ontology}).
        `);
    }

    // Check if all RIDs belong to active database records
    const allActive = await areActiveRIDs(db, base);

    if (!allActive) {
        throw new ValidationError(`
            All base records must be valid active records (non soft-deleted).
        `);
    }
};

/**
 * Given some graph records (mixed Nodes & Edges),
 * returns segregated mappings of RIDs to their corresponding records, for both Edges & Nodes.
 *
 * Also perform the removal of unwanted properties since both nodes & edges properties
 * get returned for all records on traversal.
 *
 * @param {Map<string, Object>} records - The graph records, mapped by RID
 * @param {Object} [opt={}]
 * @param {Array.<string>} [edgeClasses=getInheritingClasses('E')] - Selected Edge classes
 * @param {Array.<string>} [nodeClasses=getInheritingClasses('V')] - Selected Node classes
 * @param {Array.<string>} [opt.returnEdgeProperties=DEFAULT_EDGE_PROPERTIES]
 * @param {Array.<string>} [opt.returnNodeProperties=DEFAULT_NODE_PROPERTIES]
 * @returns {Object} graph - The corresponding graph nodes and edges
 *   @property {Map<string, Object>} graph.edges - Mapping between RIDs and edges records
 *   @property {Map<string, Object>} graph.nodes - Mapping between RIDs and nodes records
 */
const getGraph = (records, {
    edgeClasses = getInheritingClasses('E'),
    nodeClasses = getInheritingClasses('V'),
    returnEdgeProperties = DEFAULT_EDGE_PROPERTIES,
    returnNodeProperties = DEFAULT_NODE_PROPERTIES,
} = {}) => {
    const graph = { edges: new Map(), nodes: new Map() };

    records.forEach((r, rid) => {
        if (edgeClasses.includes(r['@class'])) {
            const edge = _.pick(r, returnEdgeProperties);

            // strignify RIDs
            edge['@rid'] = String(edge['@rid']);
            edge.in = String(edge.in);
            edge.out = String(edge.out);

            graph.edges.set(rid, edge);
        }
        if (nodeClasses.includes(r['@class'])) {
            graph.nodes.set(rid, _.pick(r, returnNodeProperties));
        }
    });

    return graph;
};

/**
 * Helper function for building the traverse string of a larger query string.
 *
 * @param {Object} [opt={}]
 * @param {string|null} [opt.direction=null] - The direction
 * @param {Array.<string>} [opt.edges=DEFAULT_EDGES] - The similarity Edges to follow in both directions
 * @param {Array.<string>} [opt.treeEdges=DEFAULT_TREEEDGES] - The hierarchy Edges to follow in the given direction
 * @param {boolean} [opt.withEdges=true] - Returning traversed Edge
 * @returns {string} traverseExpr - The traverse expression
 */
const buildTraverseExpr = ({
    direction = null,
    edges = DEFAULT_EDGES,
    treeEdges = DEFAULT_TREEEDGES,
    withEdges = true,
} = {}) => {
    let traverseExpr = '';

    if (!['ascending', 'descending'].includes(direction) && direction !== null) {
        throw new ValidationError(
            `'${direction}' is not a valid direction. Must be one of ascending|descending, or null`,
        );
    }

    // Expression for traversing similarity edges in both directions
    if (edges.length !== 0) {
        if (withEdges) {
            // both() & bothE()
            traverseExpr += `${edges.map((x) => `both('${x}'),bothE('${x}')`).join(',')}`;
        } else {
            // both()
            traverseExpr += `${edges.map((x) => `both('${x}')`).join(',')}`;
        }
    }

    // Expression for traversing hierarchy edges (treeEdges) in a the given direction
    if (direction) {
        if (edges.length !== 0 && treeEdges.length !== 0) {
            traverseExpr += ','; // needed for concatenation with previous string, if any
        }
        if (treeEdges.length !== 0) {
            const d = DEFAULT_DIRECTIONS[direction]; // ascending|descending => in|out

            if (withEdges) {
                // in()|out() & inE()|outE()
                traverseExpr += `${treeEdges.map((x) => `${d}('${x}'),${d}E('${x}')`).join(',')}`;
            } else {
                // in()|out()
                traverseExpr += `${treeEdges.map((x) => `${d}('${x}')`).join(',')}`;
            }
        }
    }

    return traverseExpr;
};

/**
 * Given a query string, query the database using pagination.
 * Returns an array of db records.
 *
 * Leverage RID pagination, which is expected to be faster that skipping.
 *
 * @param {Object} db - The database session object
 * @param {string} queryString - The original query string before pagination
 * @param {Object} [opt={}]
 * @param {number} [opt.maxSize=MAX_SIZE] - Total number of records limit
 * @param {number} [opt.pageSize=PAGE_SIZE] - Page size limit
 * @returns {Array.<Object>} records - The concatenated selected records
 */
const queryWithPagination = async (db, queryString, {
    maxSize = MAX_SIZE,
    pageSize = PAGE_SIZE,
} = {}) => {
    const records = [];

    // Given a queryString, returns it with added pagination
    // (woks with more or less basic query strings)
    const paginate = (initialQueryString, lowerLimit, limit) => {
        if (/WHERE[^)]*$/.test(initialQueryString)) {
            return `${initialQueryString} AND @rid > ${lowerLimit} LIMIT ${limit}`;
        }
        return `${initialQueryString} WHERE @rid > ${lowerLimit} LIMIT ${limit}`;
    };

    let lowerRid = '#-1:-1';

    while (true) {
        // Paginating
        const limit = maxSize - records.length < pageSize
            ? maxSize - records.length
            : pageSize;
        const paginatedQueryString = paginate(queryString, lowerRid, limit);
        logger.debug(paginatedQueryString);

        // Query
        const results = await db.query(paginatedQueryString).all();
        logger.debug(`page results: ${results.length}`);
        records.push(...results);

        // Breaking loop
        if (results.length < pageSize) { break; } // Stop if no more results
        if (records.length >= maxSize) { break; } // Stop if max limit is reached

        // Increment
        lowerRid = results[results.length - 1]['@rid'];
    }

    logger.debug(`paginated records: ${records.length}`);
    return records;
};

/**
 * Given a graph, return its adjacency list (actuqally a map of sets).
 * Symmetric by default (process edges as undirected) but can also be directed.
 *
 * @param {Object} graph - A graph object
 * @param {Object} [opt={}]
 * @param {Object} [opt.directed=false] - Take edge directionality into account; no forced symetry
 * @returns {Map<string, Set<string>>} - The corresponding adjacency list
 */
const getAdjacency = (graph, { directed = false } = {}) => {
    const adj = new Map();

    // Adding nodes based on linked edges
    graph.edges.forEach((edge) => {
        // out => {in}
        if (!adj.has(edge.out)) {
            adj.set(edge.out, new Set());
        }
        adj.get(edge.out).add(edge.in);

        // in => {out}
        if (!directed) {
            if (!adj.has(edge.in)) {
                adj.set(edge.in, new Set());
            }
            adj.get(edge.in).add(edge.out);
        }
    });

    // Adding remaining nodes
    graph.nodes.forEach((v, rid) => {
        // id => {}
        if (!adj.has(rid)) {
            adj.set(rid, new Set());
        }
    });

    return adj;
};

/**
 * Given a graph's symetric adjacency list, return its connected components.
 * (weakly connected, i.e. ignore edge directions).
 *
 * If the graph is disconnected, then more than one component is returned.
 *
 * @param {Map<string, Set<string>>} adj - An adjacency list. Must be symetric
 * @returns {string[][]} - The corresponding connected components
 */
const getComponents = (adj) => {
    const visited = new Set();
    const components = [];

    for (const node of adj.keys()) {
        if (!visited.has(node)) {
            const component = [];
            const queue = [node];
            visited.add(node);

            while (queue.length > 0) {
                const current = queue.shift();
                component.push(current);

                // Iterate through neighbors (Set)
                for (const neighbor of adj.get(current)) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }
            components.push(component);
        }
    }
    return components;
};

module.exports = {
    areActiveRIDs,
    baseValidation,
    buildTraverseExpr,
    getAdjacency,
    getClasses,
    getComponents,
    getGraph,
    getInheritingClasses,
    queryWithPagination,
};
