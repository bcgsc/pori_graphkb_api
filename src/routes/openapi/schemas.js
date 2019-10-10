
/**
 * reuseable schema objects (components/schemas)
 */
/**
 * @constant
 * @ignore
 */
const { schema } = require('@bcgsc/knowledgebase-schema');

const {
    constants: {
        OPERATORS, DIRECTIONS,
    },
} = require('./../../repo/query_builder');
const {
    MAX_QUERY_LIMIT, MAX_JUMPS,
} = require('./constants');

const PREFIX = '#/components/schemas';
const NODE_MODEL_NAMES = schema.getModels().filter(m => !m.isEdge).map(m => m.name);
const EDGE_MODEL_NAMES = schema.getModels().filter(m => m.isEdge && !m.isAbstract).map(m => m.name);

const dependency = {
    $ref: `${PREFIX}/RecordLink`,
    nullable: true,
    description: 'For an ontology term, a dependency is defined if the information defining the term was collected as a side-effect of creating another term.',
};

const deprecated = {
    type: 'boolean',
    description: 'For an ontology term, indicates that according to the source, the current term is deprecated',
    nullable: false,
    default: false,
};

const source = {
    $ref: `${PREFIX}/SourceLink`,
    description: 'The link to the source which is responsible for contributing this ontology term',
};

const SourceLink = {
    description: 'A direct link to source record. Can be the record ID of the linked source record in the form of a string or the record itself',
    anyOf: [
        {
            $ref: `${PREFIX}/RecordId`,
        },
        {
            type: 'object',
            $ref: `${PREFIX}/Source`,
        },
    ],
};

const EdgeList = {
    description: 'A mapping of record IDs to objects representing additional edge attributes',
};

const RecordLink = {
    description: 'A direct link to another record. Can be the record ID of the linked record in the form of a string or the record itself',
    anyOf: [
        {
            $ref: `${PREFIX}/RecordId`,
        },
        {
            type: 'object',
            properties: { '@rid': { $ref: `${PREFIX}/RecordId` } },
            additionalProperties: true,
        },
    ],
};

const UserLink = {
    description: 'A direct link to user record. Can be the record ID of the linked user record in the form of a string or the record itself',
    anyOf: [
        {
            $ref: `${PREFIX}/RecordId`,
        },
        {
            $ref: `${PREFIX}/User`,
        },
    ],
};

const OntologyLink = {
    description: 'A direct link to ontology term record. Can be the record ID of the linked ontology record in the form of a string or the record itself',
    anyOf: [
        {
            $ref: `${PREFIX}/RecordId`,
        },
        {
            $ref: `${PREFIX}/Ontology`,
        },
    ],
};

const VocabularyLink = {
    description: 'A direct link to vocabulary term record. Can be the record ID of the linked vocabulary record in the form of a string or the record itself',
    anyOf: [
        {
            $ref: `${PREFIX}/RecordId`,
        },
        {
            $ref: `${PREFIX}/Vocabulary`,
        },
    ],
};

const FeatureLink = {
    description: 'A direct link to feature record. Can be the record ID of the linked feature record in the form of a string or the record itself',
    anyOf: [
        {
            $ref: `${PREFIX}/RecordId`,
        },
        {
            $ref: `${PREFIX}/Feature`,
        },
    ],
};

const RecordList = {
    type: 'array',
    description: 'A list of record IDs',
    items: { $ref: `${PREFIX}/RecordLink` },
};

const Error = {
    type: 'object',
    properties: {
        message: { type: 'string', description: 'The error message' },
        name: { type: 'string', description: 'The name of the type of error' },
        stacktrace: {
            type: 'array',
            description: 'Optionally, the error may include a stack trace to aid in debugging',
            items: { type: 'string' },
        },
    },
};


const SubQuery = {
    description: 'Query based on the conditions in the filters clause',
    type: 'object',
    required: ['target'],
    properties: {
        filters: {
            anyOf: [
                { $ref: `${PREFIX}/Clause` },
                { $ref: `${PREFIX}/Comparison` },
            ],
        },
        target: {
            anyOf: [
                { type: 'string', enum: NODE_MODEL_NAMES },
                { type: 'array', items: { $ref: `${PREFIX}/RecordId` } },
                { $ref: `${PREFIX}/SubQuery` },
                { $ref: `${PREFIX}/FixedSubQuery` },
            ],
        },
    },
};


const FixedSubQuery = {
    description: 'Fixed subquery',
    anyOf: [
        { $ref: `${PREFIX}/KeywordQuery` },
        { $ref: `${PREFIX}/NeighborhoodQuery` },
        { $ref: `${PREFIX}/TreeQuery` },
        { $ref: `${PREFIX}/SimilarityQuery` },
    ],
};


const KeywordQuery = {
    description: 'Search by keyword',
    type: 'object',
    required: ['queryType', 'target', 'keyword'],
    properties: {
        target: { type: 'string', enum: NODE_MODEL_NAMES },
        queryType: { type: 'string', enum: ['keyword'] },
        keyword: { type: 'string' },
    },
};


const SimilarityQuery = {
    type: 'object',
    description: 'Expand some query or list of records based on following edges indicating equivalence or similarity',
    required: ['queryType', 'target'],
    properties: {
        queryType: {
            type: 'string', enum: ['similarTo'], description: 'The query type',
        },
        edges: {
            type: 'array',
            items: {
                type: 'string',
                enum: EDGE_MODEL_NAMES,
            },
            description: 'The edge classes to follow',
        },
        target: { type: 'string', enum: NODE_MODEL_NAMES },
    },
};


const TreeQuery = {
    type: 'object',
    description: 'Query for a given vertex and then follow edges for a given direction as long as possible',
    required: ['queryType', 'target', 'filters'],
    properties: {
        queryType: {
            type: 'string', enum: ['ancestors', 'descendants'], description: 'The query type',
        },
        edges: {
            type: 'array',
            items: {
                type: 'string',
                enum: EDGE_MODEL_NAMES,
            },
            description: 'The edge classes to follow',
        },
        target: { type: 'string', enum: NODE_MODEL_NAMES },
        filters: {
            anyOf: [
                { $ref: `${PREFIX}/Clause` },
                { $ref: `${PREFIX}/Comparison` },
            ],
        },
    },
};


const NeighborhoodQuery = {
    type: 'object',
    description: 'Query for a vertex and then grab surrounding vertices up to a given depth',
    required: ['queryType', 'target', 'filters'],
    properties: {
        queryType: {
            enum: ['neighborhood'],
        },
        edges: {
            default: null,
            type: 'array',
            items: {
                type: 'string',
                enum: EDGE_MODEL_NAMES,
            },
        },
        filters: {
            anyOf: [
                { $ref: `${PREFIX}/Clause` },
                { $ref: `${PREFIX}/Comparison` },
            ],
        },
        target: { type: 'string', enum: NODE_MODEL_NAMES },
        depth: {
            type: 'integer', description: 'maximum depth to follow out from a matched node',
        },
        direction: {
            type: 'string', enum: Object.values(DIRECTIONS), description: 'Direction of edges to follow',
        },
    },
};


const Query = {
    anyOf: [
        { $ref: `${PREFIX}/SubQuery` },
        { $ref: `${PREFIX}/FixedSubQuery` },
    ],
    properties: {
        limit: { $ref: `${PREFIX}/limit` },
        skip: { $ref: `${PREFIX}/skip` },
        returnProperties: { $ref: `${PREFIX}/returnProperties` },
        orderBy: { $ref: `${PREFIX}/orderBy` },
        orderByDirection: { $ref: `${PREFIX}/orderByDirection` },
        count: { $ref: `${PREFIX}/count` },
    },
};


const Clause = {
    oneOf: [
        {
            type: 'object',
            properties: {
                AND: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        anyOf: [
                            { $ref: `${PREFIX}/Clause` },
                            { $ref: `${PREFIX}/Comparison` },
                        ],
                    },
                },
            },
        },
        {
            type: 'object',
            properties: {
                OR: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        anyOf: [
                            { $ref: `${PREFIX}/Clause` },
                            { $ref: `${PREFIX}/Comparison` },
                        ],
                    },
                },
            },
        },
    ],
};

const Comparison = {
    type: 'object',
    minProperties: 1,
    additionalProperties: {
        oneOf: [
            { type: 'array', items: { $ref: `${PREFIX}/RecordId` } },
            { type: 'string' },
            { type: 'number' },
            { type: 'boolean' },
            { $ref: `${PREFIX}/SubQuery` },
        ],
    },
    properties: {
        operator: { type: 'string', enum: Object.values(OPERATORS).filter(op => !['AND', 'OR'].includes(op)) },
        negate: { type: 'boolean', description: 'Negation of this comparison', default: false },
    },
};


module.exports = {
    dependency,
    deprecated,
    EdgeList,
    Error,
    FeatureLink,
    OntologyLink,
    RecordLink,
    RecordList,
    source,
    SourceLink,
    UserLink,
    VocabularyLink,
    Query,
    Clause,
    Comparison,
    TreeQuery,
    FixedSubQuery,
    SubQuery,
    SimilarityQuery,
    NeighborhoodQuery,
    KeywordQuery,
    skip: {
        nullable: true, type: 'integer', min: 0, description: 'The number of records to skip. Used in combination with limit for paginating queries.',
    },
    history: { type: 'boolean', default: false },
    returnProperties: { type: 'array', items: { type: 'string' }, description: 'array of property names to return (defaults to all)' },
    limit: {
        type: 'integer', min: 1, max: MAX_QUERY_LIMIT, description: 'maximum number of records to return',
    },
    neighbors: {
        type: 'integer',
        min: 0,
        max: MAX_JUMPS,
        description: 'For the final query result, fetch records up to this many links away (warning: may significantly increase query time)',
    },
    count: { type: 'boolean', default: 'false', description: 'return a count of the resulting records instead of the records themselves' },
    orderBy: { type: 'string', description: 'CSV delimited list of property names (traversals) to sort the results by' },
    orderByDirection: { type: 'string', enum: ['ASC', 'DESC'], description: 'When orderBy is given, this is used to determine the ordering direction' },
};
