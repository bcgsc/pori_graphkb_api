/**
 * GRAPH VIRTUALIZATION MODULE
 */
const { logger } = require('../logging');
const { DEFAULT_EDGES, DEFAULT_TREEEDGES } = require('./constants');

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
    return {};
};

module.exports = {
    virtualize,
};
