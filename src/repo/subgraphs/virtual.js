/* eslint-disable one-var */
/**
 * GRAPH VIRTUALIZATION MODULE
 */
const { logger } = require('../logging');
const { DEFAULT_DIRECTIONS, DEFAULT_EDGES, DEFAULT_TREEEDGES } = require('./constants');
const { getAdjacency, getComponents } = require('./util');

/**
 * Given a short list of node RIDs and a mapping of node RIDs
 * to their record details, return the RID of a 'prefered' node record
 * from which a virtual node can borrow properties (e.g. id (@rid), name, etc).
 *
 * Preference based on:
 * 1. Absence of outgoing 'DeprecatedBy' edge (not being deprecated)
 * 2. Absence of outgoing 'AliasOf' edge (not aliasing)
 * 3. Source sort index
 *
 * @param {Array.<string>} rids - The node RIDs we want to pick a prefered record from
 * @param {Map<string, Object>} nodes - The mapping from RIDs to record object
 * @param {Object} [opt={}]
 * @param {Array.<string>} [opt.aliasing=new Set()] - Aliasing node RIDs
 * @param {Array.<string>} [opt.deprecated=new Set()] - Deprecated node RIDs
 * @returns {string} rid - The RID of a prefered node record
 */
const getPreferedRecord = (rids, nodes, {
    aliasing = new Set(),
    deprecated = new Set(),
} = {}) => {
    const sortingArray = [];

    // Build sorting array
    rids.forEach((rid) => {
        const node = nodes.get(rid);

        // source.sort index
        let sourceSorting;

        if (Object.prototype.hasOwnProperty.call(node, 'source.sort')) {
            sourceSorting = node['source.sort'];
        } else {
            sourceSorting = 99999;
        }

        // the sorting object
        sortingArray.push({
            '@rid': rid,
            isAliasing: aliasing.has(rid),
            isDeprecated: deprecated.has(rid),
            sourceSorting,
        });
    });

    // Sort array
    sortingArray.sort((x, y) => {
        if (x.isDeprecated !== y.isDeprecated) {
            return x.isDeprecated - y.isDeprecated;
        }
        if (x.isAliasing !== y.isAliasing) {
            return x.isAliasing - y.isAliasing;
        }
        return x.sourceSorting - y.sourceSorting;
    });

    // Returns 1st
    return sortingArray[0]
        ? sortingArray[0]['@rid']
        : '';
};

/**
 * Given the vNodes of a virtual graph/subgraph, return a mapping from each of the
 * actual 'real' node to the corresponding virtual one.
 *
 * @param {Map<string, Object>} vNodes - The virtual nodes (id => vNode object)
 * @returns {Map<string, string>} NodeToVNodeMap - Node to vNode mapping (Node rid => vNode id)
 *
 * @example getNodeToVNode(
 *      { '#1:23' => { records: [ { '@rid': '#1:23' }, { '@rid': '#1:24' } ] } }
 * ) => { '#1:23' => '#1:23', '#1:24' => '#1:23' }
 */
const getNodeToVNode = (vNodes) => {
    const NodeToVNodeMap = new Map();

    vNodes.forEach((vNode, id) => {
        vNode.records.forEach((r) => {
            NodeToVNodeMap.set(String(r['@rid']), id);
        });
    });
    return NodeToVNodeMap;
};

/**
 * Given the vNodes of a virtual graph/subgraph, return a mapping from each of the
 * virtual node to the corresponding actual 'real' one.
 *
 * @param {Map<string, Object>} vNodes - The virtual nodes (id => vNode object)
 * @returns {Map<string, Array.<string>>} vNodeToNodeMap - vNode to Node mapping (vNode id => [Node RIDs])
 *
 * @example getVNodeToNode(
 *      { '#1:23' => { records: [ { '@rid': '#1:23' }, { '@rid': '#1:24' } ] } }
 * ) => { '#1:23' => ['#1:23', '#1:24'] }
 */
const getVNodeToNode = (vNodes) => {
    const vNodeToNodeMap = new Map();

    vNodes.forEach((vNode, id) => {
        vNodeToNodeMap.set(id, []);
        vNode.records.forEach((r) => {
            vNodeToNodeMap.get(id).push(String(r['@rid']));
        });
    });
    return vNodeToNodeMap;
};

/**
 * Given an actual graph/subgraph, returns the corresponding vNodes based on similarity edge classes.
 *
 * @param {Object} graph - The actual graph/subgraph
 * @param {Map<string, Object>} graph.edges - The actual graph edges (rid => edge record)
 * @param {Map<string, Object>} graph.nodes - The actual graph nodes (rid => node record)
 * @param {Object} [opt={}]
 * @param {Array.<string>} [opt.edges=DEFAULT_EDGES] - Similarity edge classes
 * @returns {Map<string, Object>} vNodes - The virtual nodes (id => vNode object)
 */
const createVirtualNodes = (graph, { edges = DEFAULT_EDGES } = {}) => {
    // Keeping track of deprecated & aliasing nodes, for preference order
    const deprecated = new Set();
    const aliasing = new Set();

    // Each RID is mapped to the set of all similar RIDs
    const similar = new Map();

    // Grouping similar nodes, based on similarity edges
    graph.edges.forEach((record) => {
        if (edges.includes(record['@class'])) { // if a similarity edge
            const inRid = record.in;
            const outRid = record.out;

            if (!similar.has(outRid) && !similar.has(inRid)) {
                // A new set of RIDs is created and mapped to both RIDs
                const newSet = new Set([outRid, inRid]);
                similar.set(outRid, newSet); // outgoing node RID => newSet
                similar.set(inRid, newSet); // incomming node RID => same newSet
            } else if (!similar.has(outRid)) {
                // set is assigned by reference
                const inSet = similar.get(inRid);
                inSet.add(outRid);
                similar.set(outRid, inSet);
            } else if (!similar.has(inRid)) {
                // set is assigned by reference
                const outSet = similar.get(outRid);
                outSet.add(inRid);
                similar.set(inRid, outSet);
            } else {
                const inSet = similar.get(inRid);
                const outSet = similar.get(outRid);

                // If sets are not the same, then it means this edge is between 2 nodes that are,
                // so far, in 2 different similarity groups that needs merging.
                // Sets are merged then this newly created set is assigned by reference to all RIDs
                if (inSet !== outSet) {
                    // merging sets
                    const newSet = new Set([...inSet, ...outSet]);
                    // reassigning merged set
                    inSet.forEach((val) => {
                        similar.set(val, newSet);
                    });
                    outSet.forEach((val) => {
                        similar.set(val, newSet);
                    });
                }
            }
        }
        // deprecated & aliasing nodes
        if (record['@class'] === 'AliasOf') {
            aliasing.add(record.out);
        }
        if (record['@class'] === 'DeprecatedBy') {
            deprecated.add(record.out);
        }
    });

    // Adding nodes that aren't linked by any similarity edge
    graph.nodes.forEach((_, rid) => {
        if (!similar.has(rid)) {
            const newSet = new Set([rid]);
            similar.set(rid, newSet);
        }
    });

    // CONSOLIDATION : Set(Sets of RIDs)
    // Each unique set of RIDs is kept in a consolidated set; removes duplicates
    const consolidated = new Set();

    similar.forEach((ridsSet) => {
        consolidated.add(ridsSet);
    });

    // REFACTORING : Map(id => vNode)
    // Create a virtual node for each set of RIDs (similar nodes)
    const vNodes = new Map();

    consolidated.forEach((ridsSet) => {
        // RID of prefered node record acting as virtual node id
        const id = getPreferedRecord(
            [...ridsSet],
            graph.nodes,
            { aliasing, deprecated },
        );
        // sorted records array
        const fn = (a, b) => String(a['@rid']).localeCompare(String(b['@rid']));
        const records = [...ridsSet].map((rid) => graph.nodes.get(rid)).sort(fn);

        // vNode
        vNodes.set(id, {
            label: graph.nodes.get(id).name || graph.nodes.get(id).displayName || id,
            records,
        });
    });

    return vNodes;
};

/**
 * Given an actual graph/subgraph and the vNodes of a virtual grapg/subgraph,
 * returns the vEdges based on hierarchy edge classes (treeEdges).
 *
 * Following graph conventions:
 * normal/non-inverted = edge's arrow form parent to child
 * inverted = edge's arrow from child to parent
 *
 * @param {Object} graph - The actual graph/subgraph
 * @param {Map<string, Object>} graph.edges - The actual graph edges (rid => edge record)
 * @param {Map<string, Object>} graph.nodes - The actual graph nodes (rid => node record)
 * @param {Object} [opt={}]
 * @param {boolean} [opt.inverted=false] - Returning an inverted vGraph (child->parent, not parent->child)
 * @param {boolean} [opt.selfLoopAllowed=true] - Allowing self-referencing vNodes
 * @param {Array.<string>} [opt.treeEdges=DEFAULT_TREEEDGES] - Hierarchy edge classes
 * @returns {Map<string, Object>} vEdges - The virtual edges (id => vEdge object)
 */
const createVirtualEdges = (graph, nodesLookup, {
    inverted = false,
    selfLoopAllowed = true,
    treeEdges = DEFAULT_TREEEDGES,
} = {}) => {
    // Each virtual edge get assigned an id that is mapped to a vEdge object
    const vEdges = new Map();

    graph.edges.forEach((record) => {
        if (treeEdges.includes(record['@class'])) {
            // connected vNodes
            let childVNodeId = nodesLookup.get(
                record[DEFAULT_DIRECTIONS.descending], // record.in
            );
            let parentVNodeId = nodesLookup.get(
                record[DEFAULT_DIRECTIONS.ascending], // record.out
            );

            // Inversion
            if (inverted) {
                [parentVNodeId, childVNodeId] = [childVNodeId, parentVNodeId];
            }

            // vEdge
            if (!selfLoopAllowed && childVNodeId === parentVNodeId) {
                return;
            }
            const id = `${parentVNodeId}-${childVNodeId}`; // Makes sure equivalent vEdges don't get duplicated
            vEdges.set(id, { in: childVNodeId, out: parentVNodeId });
        }
    });

    return vEdges;
};

/**
 * Given an actual graph/subgraph, generates a simplified virtual representation by aggregating
 * similar nodes (via similarity edges) into unique vNodes and remapping hierarchical
 * relationships (via hierarchy treeEdges) with vEdges.
 *
 * @param {Object} graph - The actual graph/subgraph
 * @param {Map<string, Object>} graph.edges - The actual graph edges (rid => edge record)
 * @param {Map<string, Object>} graph.nodes - The actual graph nodes (rid => node record)
 * @param {Object} [opt={}]
 * @param {Array.<string>} [opt.edges=DEFAULT_EDGES] - Similarity edge classes
 * @param {boolean} [opt.inverted=false] - Returning an inverted vGraph (child->parent, not parent->child)
 * @param {boolean} [opt.selfLoopAllowed=true] - Allowing self-referencing vNodes
 * @param {Array.<string>} [opt.treeEdges=DEFAULT_TREEEDGES] - Hierarchy edge classes
 * @returns {Object} output - The virtualized graph object
 */
const virtualize = (graph, {
    edges = DEFAULT_EDGES,
    inverted = false,
    selfLoopAllowed = true,
    treeEdges = DEFAULT_TREEEDGES,
} = {}) => {
    // VNODES
    const vNodes = createVirtualNodes(graph, { edges });

    // VEDGES
    const nodeToVNodeMap = getNodeToVNode(vNodes);
    const vEdges = createVirtualEdges(
        graph,
        nodeToVNodeMap,
        { inverted, selfLoopAllowed, treeEdges },
    );

    // OUTPUT
    // nodes & edges
    const output = {
        edges: Object.fromEntries(vEdges), // serializable obj.
        nodes: Object.fromEntries(vNodes), // serializable obj.
    };
    logger.debug(`v: { edges: ${vEdges.size}, nodes: ${vNodes.size} }`);

    // Adjacency list
    const vAdj = getAdjacency({ edges: vEdges, nodes: vNodes });

    output.adjacency = Object.fromEntries(
        Array.from(vAdj, ([key, set]) => [key, Array.from(set)]), // serializable obj.
    );
    logger.debug(`v: { adjacency: ${vAdj.size} }`);

    // Connected components
    output.components = getComponents(vAdj);
    logger.debug(`v: { components: ${output.components.length} }`);

    // g_to_v nodes mapping
    output.g_to_v = Object.fromEntries(nodeToVNodeMap); // serializable obj.
    logger.debug(`v: { g_to_v: ${nodeToVNodeMap.size} }`);

    // v_to_g nodes mapping
    const vNodeToNodeMap = getVNodeToNode(vNodes);
    output.v_to_g = Object.fromEntries(vNodeToNodeMap); // serializable obj.
    logger.debug(`v: { v_to_g: ${vNodeToNodeMap.size} }`);

    return output;
};

module.exports = {
    createVirtualEdges,
    createVirtualNodes,
    getNodeToVNode,
    getPreferedRecord,
    getVNodeToNode,
    virtualize,
};
