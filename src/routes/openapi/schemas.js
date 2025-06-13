/**
 * reuseable schema objects (components/schemas)
 */
/**
 * @constant
 * @ignore
 */
const { schema } = require('@bcgsc-pori/graphkb-schema');

const {
    DEFAULT_EDGE_PROPERTIES,
    DEFAULT_EDGES,
    DEFAULT_NODE_PROPERTIES,
    DEFAULT_TREEEDGES,
    MAX_DEPTH,
} = require('../../repo/subgraphs/constants');

const {
    constants: {
        OPERATORS, DIRECTIONS, SIMILARITY_EDGES, TREE_EDGES,
    },
} = require('../../repo/query_builder');
const {
    MAX_QUERY_LIMIT, MAX_JUMPS,
} = require('./constants');

const PREFIX = '#/components/schemas';
const NODE_MODEL_NAMES = schema.getModels().filter((m) => !m.isEdge).map((m) => m.name);
const EDGE_MODEL_NAMES = schema.getModels().filter((m) => m.isEdge && !m.isAbstract).map((m) => m.name);

const dependency = {
    $ref: `${PREFIX}/RecordLink`,
    description: 'For an ontology term, a dependency is defined if the information defining the term was collected as a side-effect of creating another term.',
    nullable: true,
};

const deprecated = {
    default: false,
    description: 'For an ontology term, indicates that according to the source, the current term is deprecated',
    nullable: false,
    type: 'boolean',
};

const source = {
    $ref: `${PREFIX}/SourceLink`,
    description: 'The link to the source which is responsible for contributing this ontology term',
};

const SourceLink = {
    anyOf: [
        {
            $ref: `${PREFIX}/RecordId`,
        },
        {
            $ref: `${PREFIX}/Source`,
            type: 'object',
        },
    ],
    description: 'A direct link to source record. Can be the record ID of the linked source record in the form of a string or the record itself',
};

const EdgeList = {
    description: 'A mapping of record IDs to objects representing additional edge attributes',
};

const RecordLink = {
    anyOf: [
        {
            $ref: `${PREFIX}/RecordId`,
        },
        {
            additionalProperties: true,
            properties: { '@rid': { $ref: `${PREFIX}/RecordId` } },
            type: 'object',
        },
    ],
    description: 'A direct link to another record. Can be the record ID of the linked record in the form of a string or the record itself',
};

const UserLink = {
    anyOf: [
        {
            $ref: `${PREFIX}/RecordId`,
        },
        {
            $ref: `${PREFIX}/User`,
        },
    ],
    description: 'A direct link to user record. Can be the record ID of the linked user record in the form of a string or the record itself',
};

const OntologyLink = {
    anyOf: [
        {
            $ref: `${PREFIX}/RecordId`,
        },
        {
            $ref: `${PREFIX}/Ontology`,
        },
    ],
    description: 'A direct link to ontology term record. Can be the record ID of the linked ontology record in the form of a string or the record itself',
};

const VocabularyLink = {
    anyOf: [
        {
            $ref: `${PREFIX}/RecordId`,
        },
        {
            $ref: `${PREFIX}/Vocabulary`,
        },
    ],
    description: 'A direct link to vocabulary term record. Can be the record ID of the linked vocabulary record in the form of a string or the record itself',
};

const FeatureLink = {
    anyOf: [
        {
            $ref: `${PREFIX}/RecordId`,
        },
        {
            $ref: `${PREFIX}/Feature`,
        },
    ],
    description: 'A direct link to feature record. Can be the record ID of the linked feature record in the form of a string or the record itself',
};

const RecordList = {
    description: 'A list of record IDs',
    items: { $ref: `${PREFIX}/RecordLink` },
    type: 'array',
};

const Error = {
    properties: {
        message: { description: 'The error message', type: 'string' },
        name: { description: 'The name of the type of error', type: 'string' },
        stacktrace: {
            description: 'Optionally, the error may include a stack trace to aid in debugging',
            items: { type: 'string' },
            type: 'array',
        },
    },
    type: 'object',
};

const SubQuery = {
    description: 'Query based on the conditions in the filters clause',
    properties: {
        filters: {
            anyOf: [
                { $ref: `${PREFIX}/Clause` },
                { $ref: `${PREFIX}/Comparison` },
            ],
        },
        target: {
            oneOf: [
                { enum: NODE_MODEL_NAMES, type: 'string' },
                { items: { $ref: `${PREFIX}/RecordId` }, minItems: 1, type: 'array' },
                { $ref: `${PREFIX}/SubQuery` },
                { $ref: `${PREFIX}/FixedSubQuery` },
            ],
        },
    },
    required: ['target'],
    type: 'object',
};

const FixedSubQuery = {
    anyOf: [
        { $ref: `${PREFIX}/KeywordQuery` },
        { $ref: `${PREFIX}/NeighborhoodQuery` },
        { $ref: `${PREFIX}/TreeQuery` },
        { $ref: `${PREFIX}/SimilarityQuery` },
    ],
    description: 'Fixed subquery',
};

const KeywordQuery = {
    description: 'Search by keyword',
    properties: {
        keyword: { type: 'string' },
        queryType: { enum: ['keyword'], type: 'string' },
        target: { enum: NODE_MODEL_NAMES, type: 'string' },
    },
    required: ['queryType', 'target', 'keyword'],
    type: 'object',
};

const SimilarityQuery = {
    description: 'Expand some query or list of records based on following edges indicating equivalence or similarity',
    properties: {
        edges: {
            default: SIMILARITY_EDGES,
            description: 'The edge classes to follow',
            items: {
                enum: EDGE_MODEL_NAMES,
                type: 'string',
            },
            type: 'array',
        },
        queryType: {
            description: 'The query type', enum: ['similarTo'], type: 'string',
        },
        target: {
            oneOf: [
                { enum: NODE_MODEL_NAMES, type: 'string' },
                { items: { $ref: `${PREFIX}/RecordId` }, minItems: 1, type: 'array' },
                { $ref: `${PREFIX}/SubQuery` },
                { $ref: `${PREFIX}/FixedSubQuery` },
            ],
        },
        treeEdges: {
            default: TREE_EDGES,
            description: 'The tree edge classes to follow up and down',
            items: {
                enum: EDGE_MODEL_NAMES,
                type: 'string',
            },
            type: 'array',
        },
    },
    required: ['queryType', 'target'],
    type: 'object',
};

const TreeQuery = {
    description: 'Query for a given vertex and then follow edges for a given direction as long as possible',
    properties: {
        disambiguate: {
            description: `when true the term will be expanded by similarity edges (${
                SIMILARITY_EDGES.join(',')
            }) before it the tree is created`,
            type: 'boolean',
        },
        edges: {
            description: 'The edge classes to follow',
            items: {
                enum: EDGE_MODEL_NAMES,
                type: 'string',
            },
            type: 'array',
        },
        filters: {
            anyOf: [
                { $ref: `${PREFIX}/Clause` },
                { $ref: `${PREFIX}/Comparison` },
            ],
        },
        queryType: {
            description: 'The query type', enum: ['ancestors', 'descendants'], type: 'string',
        },
        target: {
            oneOf: [
                { enum: NODE_MODEL_NAMES, type: 'string' },
                { items: { $ref: `${PREFIX}/RecordId` }, minItems: 1, type: 'array' },
            ],
        },
    },
    required: ['queryType', 'target'],
    type: 'object',
};

const NeighborhoodQuery = {
    description: 'Query for a vertex and then grab surrounding vertices up to a given depth',
    properties: {
        depth: {
            description: 'maximum depth to follow out from a matched node', type: 'integer',
        },
        direction: {
            description: 'Direction of edges to follow',
            enum: Object.values(DIRECTIONS),
            type: 'string',
        },
        edges: {
            default: null,
            items: {
                enum: EDGE_MODEL_NAMES,
                type: 'string',
            },
            type: 'array',
        },
        filters: {
            anyOf: [
                { $ref: `${PREFIX}/Clause` },
                { $ref: `${PREFIX}/Comparison` },
            ],
        },
        queryType: {
            enum: ['neighborhood'],
        },
        target: { enum: NODE_MODEL_NAMES, type: 'string' },
    },
    required: ['queryType', 'target', 'filters'],
    type: 'object',
};

const Query = {
    anyOf: [
        { $ref: `${PREFIX}/SubQuery` },
        { $ref: `${PREFIX}/FixedSubQuery` },
    ],
    properties: {
        count: { $ref: `${PREFIX}/count` },
        limit: { $ref: `${PREFIX}/limit` },
        orderBy: { $ref: `${PREFIX}/orderBy` },
        orderByDirection: { $ref: `${PREFIX}/orderByDirection` },
        returnProperties: { $ref: `${PREFIX}/returnProperties` },
        skip: { $ref: `${PREFIX}/skip` },
    },
};

const SubgraphsQuery = {
    description: 'The SubgraphsQuery object as the body payload of a subgraphs query',
    properties: {
        base: {
            description: 'Record RIDs to start traversing from',
            items: {
                type: 'string',
            },
            type: 'array',
        },
        edges: {
            default: DEFAULT_EDGES,
            description: 'Similarity edge classes',
            items: {
                enum: EDGE_MODEL_NAMES,
                type: 'string',
            },
            type: 'array',
        },
        maxDepth: {
            default: MAX_DEPTH,
            description: 'The maximum traversal depth',
            type: 'number',
        },
        returnEdgeProperties: {
            default: DEFAULT_EDGE_PROPERTIES,
            description: 'Properties to return on edge records, in addition of the default ones',
            items: {
                type: 'string',
            },
            type: 'array',
        },
        returnNodeProperties: {
            default: DEFAULT_NODE_PROPERTIES,
            description: 'Properties to return on node records, in addition of the default ones',
            items: {
                type: 'string',
            },
            type: 'array',
        },
        subgraph: {
            default: 'real',
            description: 'Whether returning the actual \'real\' subgraph, a virtualized version, or both',
            enum: [
                'real',
                'virtual',
                'both',
            ],
            type: 'string',
        },
        subgraphType: {
            description: 'The type of the returned subgraph. Decides which type of graph traversal to performe.',
            enum: [
                'similarTo',
                'children',
                'descendants',
                'parents',
                'ancestors',
                'tree',
                'complete',
            ],
            type: 'string',
        },
        treeEdges: {
            default: DEFAULT_TREEEDGES,
            description: 'Hierarchy edge classes',
            items: {
                enum: EDGE_MODEL_NAMES,
                type: 'string',
            },
            type: 'array',
        },
        vOpt: {
            description: 'Options specific to the virtualization process',
            properties: {
                inverted: {
                    default: false,
                    description: 'Returning an inverted graph (child->parent, not parent->child)',
                    type: 'boolean',
                },
                selfLoopAllowed: {
                    default: true,
                    description: 'Allowing self-referencing vNodes',
                    type: 'boolean',
                },
            },
            type: 'object',
        },
    },
    type: 'object',
};

const Subgraph = {
    description: 'The subgraph object as one of result\'s property returned from a subgraphs query',
    properties: {
        adjacency: {
            description: 'The subgraph\'s adjacency list',
            type: 'object',
        },
        components: {
            description: 'The subgraph\'s connected components',
            type: 'array',
        },
        edges: {
            additionalProperties: true,
            properties: DEFAULT_EDGE_PROPERTIES,
            required: DEFAULT_EDGE_PROPERTIES,
            type: 'object',
        },
        nodes: {
            additionalProperties: true,
            properties: DEFAULT_NODE_PROPERTIES,
            required: DEFAULT_NODE_PROPERTIES,
            type: 'object',
        },
    },
    required: ['edges', 'nodes', 'adjacency', 'components'],
    type: 'object',
};

const VSubgraph = {
    description: 'The virtual subgraph object as one of result\'s property returned from a subgraphs query',
    properties: {
        adjacency: {
            description: 'The subgraph\'s adjacency list',
            type: 'object',
        },
        components: {
            description: 'The subgraph\'s connected components',
            type: 'array',
        },
        edges: {
            additionalProperties: false,
            properties: ['in', 'out'],
            required: ['in', 'out'],
            type: 'object',
        },
        g_to_v: {
            description: 'The mapping from node RIDs to virtual node IDs',
            type: 'object',
        },
        nodes: {
            additionalProperties: true,
            properties: {
                label: {
                    type: 'string',
                },
                records: {
                    items: {
                        additionalProperties: true,
                        properties: DEFAULT_NODE_PROPERTIES,
                        required: DEFAULT_NODE_PROPERTIES,
                        type: 'object',
                    },
                    minItems: 1,
                    type: 'array',
                },
            },
            required: ['label', 'records'],
            type: 'object',
        },
        v_to_g: {
            description: 'The mapping from virtual node IDs to node RIDs',
            type: 'object',
        },
    },
    required: [
        'adjacency',
        'components',
        'edges',
        'g_to_v',
        'nodes',
        'v_to_g',
    ],
    type: 'object',
};

const Clause = {
    oneOf: [
        {
            properties: {
                AND: {
                    items: {
                        anyOf: [
                            { $ref: `${PREFIX}/Clause` },
                            { $ref: `${PREFIX}/Comparison` },
                        ],
                    },
                    minItems: 1,
                    type: 'array',
                },
            },
            type: 'object',
        },
        {
            properties: {
                OR: {
                    items: {
                        anyOf: [
                            { $ref: `${PREFIX}/Clause` },
                            { $ref: `${PREFIX}/Comparison` },
                        ],
                    },
                    minItems: 1,
                    type: 'array',
                },
            },
            type: 'object',
        },
    ],
};

const Comparison = {
    additionalProperties: {
        oneOf: [
            { items: { $ref: `${PREFIX}/RecordId` }, type: 'array' },
            { type: 'string' },
            { type: 'number' },
            { type: 'boolean' },
            { $ref: `${PREFIX}/SubQuery` },
        ],
    },
    minProperties: 1,
    properties: {
        negate: { default: false, description: 'Negation of this comparison', type: 'boolean' },
        operator: { enum: Object.values(OPERATORS).filter((op) => !['AND', 'OR'].includes(op)), type: 'string' },
    },
    type: 'object',
};

module.exports = {
    Clause,
    Comparison,
    EdgeList,
    Error,
    FeatureLink,
    FixedSubQuery,
    KeywordQuery,
    NeighborhoodQuery,
    OntologyLink,
    Query,
    RecordLink,
    RecordList,
    SimilarityQuery,
    SourceLink,
    Subgraph,
    SubgraphsQuery,
    SubQuery,
    TreeQuery,
    UserLink,
    VocabularyLink,
    VSubgraph,
    count: { default: 'false', description: 'return a count of the resulting records instead of the records themselves', type: 'boolean' },
    dependency,
    deprecated,
    history: { default: false, type: 'boolean' },
    limit: {
        description: 'maximum number of records to return', max: MAX_QUERY_LIMIT, min: 1, type: 'integer',
    },
    neighbors: {
        description: 'For the final query result, fetch records up to this many links away (warning: may significantly increase query time)',
        max: MAX_JUMPS,
        min: 0,
        type: 'integer',
    },
    orderBy: { description: 'CSV delimited list of property names (traversals) to sort the results by', type: 'string' },
    orderByDirection: { description: 'When orderBy is given, this is used to determine the ordering direction', enum: ['ASC', 'DESC'], type: 'string' },
    returnProperties: {
        description: 'array of property names to return (defaults to all). Note that the properties which can be returned must match the target model being returned',
        items: { type: 'string' },
        type: 'array',

    },

    skip: {
        description: 'The number of records to skip. Used in combination with limit for paginating queries.', min: 0, nullable: true, type: 'integer',
    },
    source,
};
