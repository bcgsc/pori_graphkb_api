
/**
 * reuseable schema objects (components/schemas)
 */
/**
 * @constant
 * @ignore
 */
const {schema: SCHEMA_DEFN} = require('@bcgsc/knowledgebase-schema');

const {
    constants: {
        TRAVERSAL_TYPE, DIRECTIONS, OPERATORS
    }
} = require('./../../repo/query');
const {
    MAX_QUERY_LIMIT, MAX_JUMPS
} = require('./constants');

const PREFIX = '#/components/schemas';

const dependency = {
    $ref: `${PREFIX}/RecordLink`,
    nullable: true,
    description: 'For an ontology term, a dependency is defined if the information defining the term was collected as a side-effect of creating another term.'
};

const deprecated = {
    type: 'boolean',
    description: 'For an ontology term, indicates that according to the source, the current term is deprecated',
    nullable: false,
    default: false
};

const source = {
    $ref: `${PREFIX}/SourceLink`,
    description: 'The link to the source which is responsible for contributing this ontology term'
};

const SourceLink = {
    description: 'A direct link to source record. Can be the record ID of the linked source record in the form of a string or the record itself',
    anyOf: [
        {
            $ref: `${PREFIX}/@rid`
        },
        {
            type: 'object',
            $ref: `${PREFIX}/Source`
        }
    ]
};

const EdgeList = {
    description: 'A mapping of record IDs to objects representing additional edge attributes'
};

const RecordLink = {
    description: 'A direct link to another record. Can be the record ID of the linked record in the form of a string or the record itself',
    anyOf: [
        {
            $ref: `${PREFIX}/@rid`
        },
        {
            type: 'object',
            properties: {'@rid': {$ref: `${PREFIX}/@rid`}},
            additionalProperties: true
        }
    ]
};

const UserLink = {
    description: 'A direct link to user record. Can be the record ID of the linked user record in the form of a string or the record itself',
    anyOf: [
        {
            $ref: `${PREFIX}/@rid`
        },
        {
            $ref: `${PREFIX}/User`
        }
    ]
};

const OntologyLink = {
    description: 'A direct link to ontology term record. Can be the record ID of the linked ontology record in the form of a string or the record itself',
    anyOf: [
        {
            $ref: `${PREFIX}/@rid`
        },
        {
            $ref: `${PREFIX}/Ontology`
        }
    ]
};

const VocabularyLink = {
    description: 'A direct link to vocabulary term record. Can be the record ID of the linked vocabulary record in the form of a string or the record itself',
    anyOf: [
        {
            $ref: `${PREFIX}/@rid`
        },
        {
            $ref: `${PREFIX}/Vocabulary`
        }
    ]
};

const FeatureLink = {
    description: 'A direct link to feature record. Can be the record ID of the linked feature record in the form of a string or the record itself',
    anyOf: [
        {
            $ref: `${PREFIX}/@rid`
        },
        {
            $ref: `${PREFIX}/Feature`
        }
    ]
};

const RecordList = {
    type: 'array',
    description: 'A list of record IDs',
    items: {$ref: `${PREFIX}/RecordLink`}
};

const Error = {
    type: 'object',
    properties: {
        message: {type: 'string', description: 'The error message'},
        name: {type: 'string', description: 'The name of the type of error'},
        stacktrace: {
            type: 'array',
            description: 'Optionally, the error may include a stack trace to aid in debugging',
            items: {type: 'string'}
        }
    }
};


const Traversal = {
    type: 'object',
    properties: {
        attr: {type: 'string', description: 'attribute name'},
        type: {
            type: 'string', description: 'traversal type', enum: Object.values(TRAVERSAL_TYPE), nullable: true
        },
        child: {
            anyOf: [
                {type: 'string'},
                {type: 'object', $ref: `${PREFIX}/Traversal`}
            ],
            nullable: true
        }
    }
};


const EdgeTraversal = {
    type: 'object',
    allOf: [{$ref: `${PREFIX}/Traversal`}],
    properties: {
        edges: {type: 'array', description: 'list of edge classes to traverse', items: {type: 'string'}},
        direction: {type: 'string', enum: ['out', 'in', 'both'], description: 'direction of edges to follow'}
    }
};


const BasicQuery = {
    description: 'Query based on the conditions in the where clause',
    type: 'object',
    required: ['where'],
    properties: {
        where: {
            type: 'object', $ref: `${PREFIX}/Clause`
        },
        class: {type: 'string', enum: Object.keys(SCHEMA_DEFN)}
    }
};

const TreeQuery = {
    type: 'object',
    description: 'Query for a given vertex and then follow edges for a given direction as long as possible',
    allOf: [{$ref: `${PREFIX}/BasicQuery`}],
    properties: {
        type: {
            type: 'string', enum: ['ancestors', 'descendants'], description: 'The query type'
        },
        edges: {
            type: 'array',
            items: {
                type: 'string',
                enum: Array.from(
                    Object.values(SCHEMA_DEFN).filter(model => model.isEdge && !model.isAbstract),
                    model => model.name
                )
            },
            description: 'The edge classes to follow'
        }
    }
};


const NeighborhoodQuery = {
    type: 'object',
    description: 'Query for a vertex and then grab surrounding vertices up to a given depth',
    allOf: [{$ref: `${PREFIX}/TreeQuery`}],
    properties: {
        type: {
            enum: ['neighborhood']
        },
        edges: {
            default: null,
            type: 'array',
            items: {
                type: 'string',
                enum: schema.getEdgeModels().map(model => model.name)
            }
        },
        depth: {
            type: 'integer', description: 'maximum depth to follow out from a matched node'
        },
        direction: {
            type: 'string', enum: Object.values(DIRECTIONS), description: 'Direction of edges to follow'
        }
    }
};


const Query = {
    anyOf: [
        {$ref: `${PREFIX}/BasicQuery`},
        {$ref: `${PREFIX}/NeighborhoodQuery`},
        {$ref: `${PREFIX}/TreeQuery`}
    ]
};


const Clause = {
    type: 'object',
    required: ['operator', 'comparisons'],
    properties: {
        operator: {type: 'string', enum: [OPERATORS.AND, OPERATORS.OR]},
        comparisons: {
            type: 'array',
            items: {
                type: 'object',
                anyOf: [
                    {$ref: `${PREFIX}/Clause`},
                    {$ref: `${PREFIX}/Comparison`}
                ]
            }
        }
    }
};

const Comparison = {
    type: 'object',
    required: ['attr', 'value'],
    properties: {
        attr: {anyOf: [{type: 'string'}, {$ref: `${PREFIX}/Traversal`}]},
        value: {
            anyOf: [
                {type: 'AnyValue'},
                {$ref: `${PREFIX}/Query`}
            ],
            description: 'The base value or subquery to be compared against'
        },
        operator: {type: 'string', enum: Object.values(OPERATORS).filter(op => !['AND', 'OR'].includes(op))},
        negate: {type: 'boolean', description: 'Negation of this comparison', default: false}
    }
};

module.exports = {
    dependency,
    deprecated,
    EdgeList,
    Error,
    EdgeTraversal,
    FeatureLink,
    OntologyLink,
    RecordLink,
    RecordList,
    source,
    SourceLink,
    UserLink,
    VocabularyLink,
    Traversal,
    Query,
    Clause,
    Comparison,
    TreeQuery,
    BasicQuery,
    NeighborhoodQuery,
    skip: {
        nullable: true, type: 'integer', min: 0, description: 'The number of records to skip. Used in combination with limit for paginating queries.'
    },
    activeOnly: {type: 'boolean', default: true},
    returnProperties: {type: 'array', items: {type: 'string'}, description: 'array of property names to return (defaults to all)'},
    limit: {
        type: 'integer', min: 1, max: MAX_QUERY_LIMIT, description: 'maximum number of records to return'
    },
    neighbors: {
        type: 'integer',
        min: 0,
        max: MAX_JUMPS,
        description: 'For the final query result, fetch records up to this many links away (warning: may significantly increase query time)'
    },
    count: {type: 'boolean', default: 'false', description: 'return a count of the resulting records instead of the records themselves'},
    orderBy: {type: 'string', description: 'CSV delimited list of property names (traversals) to sort the results by'},
    orderByDirection: {type: 'string', enum: ['ASC', 'DESC'], description: 'When orderBy is given, this is used to determine the ordering direction'}
};
