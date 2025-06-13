// Default similarity edges
const DEFAULT_EDGES = [
    'AliasOf',
    'CrossReferenceOf',
    'DeprecatedBy',
    'ElementOf',
    'GeneralizationOf',
    // 'Infers', // discarded as it has never used between nodes of an ontology class
    // 'OppositeOf', // discarded as we don't want to follow these edges in a subgraph context
    // 'TargetOf', // discarded as it has never been used between nodes of the same ontology class
];

// Default hierarchy edges
const DEFAULT_TREEEDGES = [
    'SubClassOf',
];

module.exports = {
    DEFAULT_EDGES,
    DEFAULT_TREEEDGES,
};
