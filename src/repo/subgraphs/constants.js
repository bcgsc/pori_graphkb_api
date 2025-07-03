// Default similarity edges
const DEFAULT_EDGES = [
    'AliasOf',
    'CrossReferenceOf',
    'DeprecatedBy',
    'ElementOf',
    'GeneralizationOf',
    // 'Infers', // discarded as it has never been used between nodes of an ontology class
    // 'OppositeOf', // discarded as we don't want to follow these edges in a subgraph context
    // 'TargetOf', // discarded as it has never been used between nodes of the same ontology class
];

// Default hierarchy edges
const DEFAULT_TREEEDGES = [
    'SubClassOf',
];

// Indicate in which default direction to follow treeEdges.
// Account for the fact that an Edge direction (from --> to) might not means
// 'from parent to chlid', e.g. -SubClassOf-> means 'from child to parent'.
// Note: this default direction has to be shared accross all treeEdges for the moment.
const DEFAULT_DIRECTIONS = {
    ascending: 'out',
    descending: 'in',
};

// Default node & edge properties on subgraph traversals
const DEFAULT_EDGE_PROPERTIES = [
    '@rid',
    '@class',
    'in', // incomming node RID
    'out', // outgoing node RID
];
const DEFAULT_NODE_PROPERTIES = [
    '@rid',
    '@class',
    'name', // used for vNode name (virtual graph)
    'source.sort', // used for prefered record selection (virtual graph)
];
const DEFAULT_PROPERTIES = [
    ...new Set([
        ...DEFAULT_EDGE_PROPERTIES,
        ...DEFAULT_NODE_PROPERTIES,
    ]),
];

// Traversal depth limit.
// Can be overridden using maxDepth option
// Dose not applied to composition traversal, which don't traverse the graph per se.
const MAX_DEPTH = 100;

// For paginated queries
const MAX_SIZE = 1000000;
const PAGE_SIZE = 5000;

module.exports = {
    DEFAULT_DIRECTIONS,
    DEFAULT_EDGES,
    DEFAULT_EDGE_PROPERTIES,
    DEFAULT_NODE_PROPERTIES,
    DEFAULT_PROPERTIES,
    DEFAULT_TREEEDGES,
    MAX_DEPTH,
    MAX_SIZE,
    PAGE_SIZE,
};
