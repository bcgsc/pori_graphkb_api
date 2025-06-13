/**
 * GRAPH TRAVERSAL FUNCTIONS
 */

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
 * @returns {Map<string, Object>} records - The selected records, mapped by RID
 */
const similarity = async (
    db,
    ontology,
    base,
    opt = {},
) => {
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
 */
const immediate = async (
    db,
    ontology,
    base,
    direction,
    opt = {},
) => {
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
 */
const transitive = async (
    db,
    ontology,
    base,
    direction,
    opt = {},
) => {
};

module.exports = {
    composition,
    immediate,
    similarity,
    transitive,
};
