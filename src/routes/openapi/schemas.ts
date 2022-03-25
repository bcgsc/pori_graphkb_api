/**
 * reuseable schema objects (components/schemas)
 */

import { isControlledValue } from "../../types";
import { OpenApiSchema } from "./types";

/**
 * @constant
 * @ignore
 */
import { schema } from '@bcgsc-pori/graphkb-schema';

import {
        OPERATORS, DIRECTIONS, SIMILARITY_EDGES, TREE_EDGES,
} from '../../repo/query_builder/constants';
import {
    MAX_QUERY_LIMIT, MAX_JUMPS,
}  from './constants';

const PREFIX = '#/components/schemas';
const NODE_MODEL_NAMES = schema.getModels().filter((m) => !m.isEdge).map((m) => m.name);
const EDGE_MODEL_NAMES = schema.getModels().filter((m) => m.isEdge && !m.isAbstract).map((m) => m.name);

const dependency: OpenApiSchema = {
    $ref: `${PREFIX}/RecordLink`,
    description: 'For an ontology term, a dependency is defined if the information defining the term was collected as a side-effect of creating another term.',
    nullable: true,
};

const deprecated: OpenApiSchema = {
    default: false,
    description: 'For an ontology term, indicates that according to the source, the current term is deprecated',
    nullable: false,
    type: 'boolean',
};

const source: OpenApiSchema = {
    $ref: `${PREFIX}/SourceLink`,
    description: 'The link to the source which is responsible for contributing this ontology term',
};

const SourceLink: OpenApiSchema = {
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

const EdgeList: OpenApiSchema = {
    description: 'A mapping of record IDs to objects representing additional edge attributes',
};

const RecordLink: OpenApiSchema = {
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

const UserLink: OpenApiSchema = {
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

const OntologyLink: OpenApiSchema = {
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

const VocabularyLink: OpenApiSchema = {
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

const FeatureLink: OpenApiSchema = {
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

const RecordList: OpenApiSchema = {
    description: 'A list of record IDs',
    items: { $ref: `${PREFIX}/RecordLink` },
    type: 'array',
};

const Error: OpenApiSchema = {
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

const SubQuery: OpenApiSchema = {
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

const FixedSubQuery: OpenApiSchema = {
    anyOf: [
        { $ref: `${PREFIX}/KeywordQuery` },
        { $ref: `${PREFIX}/NeighborhoodQuery` },
        { $ref: `${PREFIX}/TreeQuery` },
        { $ref: `${PREFIX}/SimilarityQuery` },
    ],
    description: 'Fixed subquery',
};

const KeywordQuery: OpenApiSchema = {
    description: 'Search by keyword',
    properties: {
        keyword: { type: 'string' },
        queryType: { enum: ['keyword'], type: 'string' },
        target: { enum: NODE_MODEL_NAMES, type: 'string' },
    },
    required: ['queryType', 'target', 'keyword'],
    type: 'object',
};

const SimilarityQuery: OpenApiSchema = {
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

const TreeQuery: OpenApiSchema = {
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

const NeighborhoodQuery: OpenApiSchema = {
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

const Query: OpenApiSchema = {
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

const Clause: OpenApiSchema = {
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

const Comparison: OpenApiSchema = {
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
        operator: { enum: Object.values(OPERATORS).filter((op) => isControlledValue(op, ['AND', 'OR'])), type: 'string' },
    },
    type: 'object',
};

const count: OpenApiSchema = { default: 'false', description: 'return a count of the resulting records instead of the records themselves', type: 'boolean' };
const history: OpenApiSchema = { default: false, type: 'boolean' };

const limit: OpenApiSchema ={
    description: 'maximum number of records to return', maximum: MAX_QUERY_LIMIT, minimum: 1, type: 'integer',
};
const neighbors: OpenApiSchema ={
    description: 'For the final query result, fetch records up to this many links away (warning: may significantly increase query time)',
    maximum: MAX_JUMPS,
    minimum: 0,
    type: 'integer',
};
const orderBy: OpenApiSchema = { description: 'CSV delimited list of property names (traversals) to sort the results by', type: 'string' };
const orderByDirection: OpenApiSchema = { description: 'When orderBy is given, this is used to determine the ordering direction', enum: ['ASC', 'DESC'], type: 'string' };
const returnProperties: OpenApiSchema = {
    description: 'array of property names to return (defaults to all). Note that the properties which can be returned must match the target model being returned',
    items: { type: 'string' },
    type: 'array',

};

const skip: OpenApiSchema = {
    description: 'The number of records to skip. Used in combination with limit for paginating queries.', minimum: 0, nullable: true, type: 'integer',
};

export {
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
    SubQuery,
    TreeQuery,
    UserLink,
    VocabularyLink,
    count,
    dependency,
    deprecated,
    history,
    limit,
    neighbors,
    orderBy,
    orderByDirection,
    returnProperties,
    skip,
    source,
};
