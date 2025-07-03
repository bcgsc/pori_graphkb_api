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

const { parsePropertyList } = require('../query_builder/projection');
const { logger } = require('../logging');
const {
    DEFAULT_DIRECTIONS,
    DEFAULT_EDGES,
    DEFAULT_TREEEDGES,
    MAX_SIZE,
    PAGE_SIZE,
} = require('./constants');

/**
 * Given an array of class names and an array of properties,
 * returns a mapping of allowed properties per class.
 *
 * Also make sure that all returnProperties are allowed on at least one of
 * the selected classes, otherwise throw an error (for SQL sanitation).
 *
 * Leverage the Query Builder and its parsePropertyList() function.
 *
 * @param {Array.<string>} cls - The record classes
 * @param {Array.<string>} returnProperties - The record's properties we're interested in
 * @returns {Map<string, Array.<string>>} Mapping of allowed properties per class
 */
const getPropsPerClass = (cls, returnProperties) => {
    const propsPerClass = new Map();
    const allowedProps = new Set();

    // filtering props per class
    cls.forEach((cl) => {
        propsPerClass.set(cl, []);
        returnProperties.forEach((prop) => {
            try {
                parsePropertyList(cl, [prop]);
                propsPerClass.get(cl).push(prop);
                allowedProps.add(prop); // flag this prop as allowed on at least one class
            } catch (err) {}
        });
    });

    // make sure all props are allowed (for SQL sanitation).
    [...new Set(returnProperties)].forEach((prop) => {
        if (!allowedProps.has(prop)) {
            throw new ValidationError(`property ${prop} does not exist or cannot be accessed on any of these models: ${cls.join(', ')}`);
        }
    });

    return propsPerClass;
};

/**
 * Given a multiline string, returns a new string formatted on one line
 *
 * @param {string} s - The string to format
 * @returns {string} The formatted string
 */
const oneliner = (s) => {
    const oneline = s
        .split('\n') // Split into lines
        .map((line) => line.trim()) // Trim each line
        .filter(Boolean) // Remove empty lines
        .join(' '); // Join with a space
    return oneline;
};

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
    let classes = [];

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
        classes = classes.filter((x) => !models[x].isAbstract);
    }

    classes.sort();
    return classes;
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

    // Check if all RIDs belong to active database records of the given ontology class
    const rids = [...new Set(base)]; // unique base records only
    const queryString = `
        SELECT
            @rid
        FROM
            :ontology
        WHERE
            @rid IN :rids AND
            deletedAt is null`;
    const params = { params: { ontology, rids } };

    logger.debug(oneliner(queryString));
    logger.debug(JSON.stringify(params));

    const records = await db.query(queryString, params).all();

    if (records.length !== rids.length) {
        throw new ValidationError(`
            All base records must be valid active records (non soft-deleted) from the ${ontology} class).
        `);
    }
};

/**
 * Given some graph records (mixed Nodes & Edges),
 * returns segregated mappings of RIDs to their corresponding records, for both Edges & Nodes.
 *
 * Also perform the removal of unwanted properties since all nodes & edges properties
 * get returned for all records on traversal.
 *
 * @param {Map<string, Object>} records - The graph records, mapped by RID
 * @param {Object} [opt={}]
 * @param {Array.<string>} [opt.edgeClasses=getInheritingClasses('E')] - Selected Edge classes
 * @param {Array.<string>} [opt.nodeClasses=getInheritingClasses('V')] - Selected Node classes
 * @param {Map<string, Array.<string>>} [opt.propsPerClass=new Map()] - Each class mapped to their props
 * @returns {Object} graph - The corresponding graph nodes and edges
 *   @property {Map<string, Object>} graph.edges - Mapping between RIDs and edges records
 *   @property {Map<string, Object>} graph.nodes - Mapping between RIDs and nodes records
 */
const getGraph = (records, {
    edgeClasses = getInheritingClasses('E'),
    nodeClasses = getInheritingClasses('V'),
    propsPerClass = new Map(),
} = {}) => {
    const graph = { edges: new Map(), nodes: new Map() };

    records.forEach((r, rid) => {
        const props = propsPerClass.get(r['@class']);

        if (edgeClasses.includes(r['@class'])) {
            graph.edges.set(rid, _.pick(r, props));
        }
        if (nodeClasses.includes(r['@class'])) {
            graph.nodes.set(rid, _.pick(r, props));
        }
    });

    return graph;
};

/**
 * Helper function for building the traverse string of a larger query string.
 * Returns both the traversal SQL expression along with its parameters
 *
 * @param {Object} [opt={}]
 * @param {string|null} [opt.direction=null] - The direction
 * @param {Array.<string>} [opt.edges=DEFAULT_EDGES] - The similarity Edges to follow in both directions
 * @param {string} [opt.prefix='t_'] - Prefix for parameter names, so they are conflic-free from other source
 * @param {Array.<string>} [opt.treeEdges=DEFAULT_TREEEDGES] - The hierarchy Edges to follow in the given direction
 * @param {boolean} [opt.withEdges=true] - Returning also the traversed Edges
 * @returns {Object} obj
 *   @property {string} obj.expr - The traverse expression
 *   @property {Object} obj.params - The query parameters
 */
const buildTraverseExpr = ({
    direction = null,
    edges = DEFAULT_EDGES,
    prefix = 't_',
    treeEdges = DEFAULT_TREEEDGES,
    withEdges = true,
} = {}) => {
    let expr = '';
    const params = {};

    if (!['ascending', 'descending'].includes(direction) && direction !== null) {
        throw new ValidationError(
            `'${direction}' is not a valid direction. Must be one of ascending|descending, or null`,
        );
    }

    // Expression for traversing similarity edges in both directions
    for (let i = 0; i < edges.length; i++) {
        const p = `${prefix}edge${i}`;
        params[p] = edges[i];

        if (i !== 0) {
            expr += ','; // for concatenation with previous string, if any
        }

        if (withEdges) {
            expr += `both(:${p}),bothE(:${p})`;
        } else {
            expr += `both(:${p})`;
        }
    }

    // Expression for traversing hierarchy edges (treeEdges) in a the given direction
    if (direction) {
        if (edges.length !== 0 && treeEdges.length !== 0) {
            expr += ','; // for concatenation with previous string, if any
        }

        const d = DEFAULT_DIRECTIONS[direction]; // ascending|descending => in|out

        for (let i = 0; i < treeEdges.length; i++) {
            const p = `${prefix}treeEdge${i}`;
            params[p] = treeEdges[i];

            if (i !== 0) {
                expr += ','; // for concatenation with previous string, if any
            }

            if (withEdges) {
                // in()|out() & inE()|outE()
                expr += `${d}(:${p}),${d}E(:${p})`;
            } else {
                // in()|out()
                expr += `${d}(:${p})`;
            }
        }
    }

    return { expr, params };
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
 * @param {number} [opt.prefix='_p'] - Params names prefix
 * @param {number} [opt.maxSize=MAX_SIZE] - Total number of records limit
 * @param {number} [opt.pageSize=PAGE_SIZE] - Page size limit
 * @param {number} [opt.withPlaceholders=false] - Paginating params placeholders already in query string
 * @returns {Array.<Object>} records - The concatenated selected records
 */
const queryWithPagination = async (
    db,
    queryString,
    params = {},
    {
        prefix = 'p_',
        maxSize = MAX_SIZE,
        pageSize = PAGE_SIZE,
        withPlaceholders = false,
    } = {},
) => {
    const records = [];

    // paginated query string
    const paginatedQueryString = [queryString];

    if (!withPlaceholders) {
        // Adding lowerBound & limit placeholders
        // Since it won't work on all query strings, the query string can also be given with these
        // placeholders already in place
        paginatedQueryString.push(
            /WHERE[^)]*$/.test(queryString)
                ? 'AND'
                : 'WHERE',
            `@rid > :${prefix}lowerBound LIMIT :${prefix}limit`,
        );
    }

    // paginated params
    const paginatedParams = { ...params };
    let lowerRid = '#-1:-1';

    while (true) {
        // Paginating
        const limit = maxSize - records.length < pageSize
            ? maxSize - records.length
            : pageSize;

        // updating paginated params
        paginatedParams.params[`${prefix}lowerBound`] = lowerRid;
        paginatedParams.params[`${prefix}limit`] = limit;
        logger.debug(paginatedQueryString.join(' '));
        logger.debug(JSON.stringify(paginatedParams));

        // Query
        const results = await db.query(paginatedQueryString.join(' '), paginatedParams).all();
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
        if (!adj.has(String(edge.out))) {
            adj.set(String(edge.out), new Set());
        }
        adj.get(String(edge.out)).add(String(edge.in));

        // in => {out}
        if (!directed) {
            if (!adj.has(String(edge.in))) {
                adj.set(String(edge.in), new Set());
            }
            adj.get(String(edge.in)).add(String(edge.out));
        }
    });

    // Adding remaining nodes
    graph.nodes.forEach((v, rid) => {
        // id => {}
        if (!adj.has(rid)) {
            adj.set(rid, new Set());
        }
    });

    // sorting each set
    adj.forEach((v, k) => {
        const sortedSet = new Set([...v].sort());
        adj.set(k, sortedSet);
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
 * @returns {Array.<Array.<string>>} - The corresponding connected components
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
            component.sort();
            components.push(component);
        }
    }
    return components;
};

/**
 * Given the nodes & edges objects of a graph,
 * returns a representation in the Mermaid flowchart format.
 *
 * Both nodes and edges needs to be serializable objects as in
 * Object.fromEntries(Map<string, Object>)
 *
 * @param {Object} opt
 * @param {Object} [opt.edges={}] - graph's edges|vedges
 * @param {Object} [opt.nodes] - graph's nodes|vnodes
 * @param {string} [opt.orientation='BT'] - see Mermaid docs
 * @param {boolean} [opt.strignify=true] - returns as a string instead of an array
 * @returns {Array.<string>|string} flowchart
 */
const formatToFlowchart = ({
    edges = {},
    nodes,
    orientation = 'BT', // BT|TB|RL|LR
    strignify = true,
}) => {
    // type
    const flowchart = [`flowchart ${orientation}`];

    // nodes
    Object.keys(nodes).forEach((k) => {
        let label = '';

        if (nodes[k].label) {
            label = nodes[k].label;
        } else if (nodes[k].name) {
            label = nodes[k].name;
        }

        if (label) {
            flowchart.push(`${k}["${label}"]`);
        } else {
            flowchart.push(`${k}`);
        }
    });

    // edges
    Object.values(edges).forEach((v) => {
        flowchart.push(`${v.out} --> ${v.in}`);
    });

    // strignify
    if (strignify) {
        return flowchart.join('\n');
    }
    return flowchart;
};

module.exports = {
    baseValidation,
    buildTraverseExpr,
    formatToFlowchart,
    getAdjacency,
    getComponents,
    getGraph,
    getInheritingClasses,
    getPropsPerClass,
    oneliner,
    queryWithPagination,
};
