/**
 * SUBGRAPH FUNCTIONS
 *
 * Given an ontology class and one or more base records as a starting point,
 * all these different subgraphType functions traverse the graph in their own specific way
 * and return a subgraph (all traversed nodes and edges).
 *
 * If more than one base records are given, then the returned subgraph can be disconnected (more
 * than one connected component). Also, since the original graph is not guarantee to be acyclic,
 * so are each connected component.
 *
 * Exceptionally, the 'complete' subgraphType is queried without any base record and no traversal
 * is performed per se. Instead, the whole ontology graph is returned as a merge of individual successive
 * select queries on each class (compute and data intensive).
 */

const { traverse } = require('./traversal');

/**
 * SimilarTo subgraph
 * Given an ontology class and some base records, traverse edges (similarity) in both directions
 */
const similarTo = async (db, ontology, opt = {}) => {
    const subgraph = await traverse(db, ontology, {
        ...opt,
        direction: null,
    });
    return subgraph;
};

/**
 * Children subgraph
 * Given an ontology class and some base records, traverse edges (similarity) in both directions
 * and treeEdges (hierarchy) in a 'descending/parent-to-child' direction for 1 generation
 */
const children = async (db, ontology, opt = {}) => {
    const subgraph = await traverse(db, ontology, {
        ...opt,
        direction: 'descending',
        firstGenerationOnly: true,
    });
    return subgraph;
};

/**
 * Descendants subgraph
 * Given an ontology class and some base records, traverse edges (similarity) in both directions
 * and treeEdges (hierarchy) in a 'descending/parent-to-child' direction for all generations
 */
const descendants = async (db, ontology, opt = {}) => {
    const subgraph = await traverse(db, ontology, {
        ...opt,
        direction: 'descending',
        firstGenerationOnly: false,
    });
    return subgraph;
};

/**
 * Parents subgraph
 * Given an ontology class and some base reords, traverse edges (similarity) in both directions
 * and treeEdges (hierarchy) in a 'ascending/child-to-parent' direction for 1 generation
 */
const parents = async (db, ontology, opt = {}) => {
    const subgraph = await traverse(db, ontology, {
        ...opt,
        direction: 'ascending',
        firstGenerationOnly: true,
    });
    return subgraph;
};

/**
 * Ancestors subgraph
 * Given an ontology class and some base records, traverse edges (similarity) in both directions
 * and treeEdges (hierarchy) in a 'ascending/child-to-parent' direction for all generations
 */
const ancestors = async (db, ontology, opt = {}) => {
    const subgraph = await traverse(db, ontology, {
        ...opt,
        direction: 'ascending',
        firstGenerationOnly: false,
    });
    return subgraph;
};

/**
 * Tree subgraph
 * Given an ontology class and some base records, combines both a descendants subgraph
 * and a ancestors subgraph into one jointed subgraph.
 *
 * The returned subgraph is a directed tree, with the important exception that it is not guarantee
 * to be acyclic, which violates the tree defenition. In order to guarantee an acyclic subgraph,
 * the original graph needs to be acyclic in regards to the edges considered in the traversal.
 *
 * If more than one base nodes are given, then like with all other subgraph functions
 * the returned subgraph can be disconnected, leading here to a 'forest' instead of a 'tree'.
 */
const tree = async (db, ontology, opt = {}) => {
    const subgraph = await traverse(db, ontology, {
        ...opt,
        direction: 'split',
    });
    return subgraph;
};

/**
 * Complete subgraph
 * Given only an ontology class (no base record), returns the whole ontology graph.
 * Traversal query is not performed per se. Instead, each node and edge classes
 * are queried seperately and results are combined.
 */
const complete = async (db, ontology, opt = {}) => {
    const subgraph = await traverse(db, ontology, {
        ...opt,
        direction: 'both',
    });
    return subgraph;
};

// SubgraphType parameter values and linked functions are dynamically generated from these exports.
module.exports = {
    ancestors,
    children,
    complete,
    descendants,
    parents,
    similarTo,
    tree,
};
