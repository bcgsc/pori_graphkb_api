/**
 * Route definition components (components/routes) that cannot be auto generated only from the schema
 * @module app/routes/openapi/routes
 */
const { schema: { schema } } = require('@bcgsc/knowledgebase-schema');
const { groupableParams } = require('../../repo/commands/select');


const POST_TOKEN = {
    parameters: [
        { $ref: '#/components/parameters/Content-Type' },
        { $ref: '#/components/parameters/Accept' },
    ],
    requestBody: {
        content: {
            'application/json': {
                schema: {
                    anyOf: [
                        {
                            properties: {
                                password: { description: 'The password associated with this username', type: 'string' },
                                username: { description: 'The username', type: 'string' },
                            },
                            type: 'object',
                        },
                        {
                            properties: {
                                keyCloakToken: { description: 'The token from keycloak', type: 'string' },
                            },
                            type: 'object',
                        },
                    ],
                },
            },
        },
        required: true,
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: {
                        properties: {
                            kbToken: {
                                description: 'The token for KB API requests',
                                format: 'token',
                                type: 'string',
                            },
                            keyCloakToken: {
                                description: 'The token from keycloak',
                                format: 'token',
                                type: 'string',
                            },
                        },
                        type: 'object',
                    },
                },
            },
            description: 'The user is valid and a token has been generated',
        },
        401: {
            description: 'The credentials were incorrect or not found',
        },
    },
    summary: 'Generate an authentication token to be used for requests to the KB API server',
    tags: ['General'],
};


const POST_PARSE = {
    requestBody: {
        content: {
            'application/json': {
                schema: {
                    properties: {
                        content: { description: 'the variant string representation', example: 'KRAS:p.G12D', type: 'string' },
                        requireFeatures: { description: 'flag to indicate features are or are not required in the variant string', type: 'boolean' },
                    },
                    required: ['content'],
                    type: 'object',
                },
            },
        },
        required: true,
    },
    responses: {
        200: {
            content: { 'application/json': { schema: { type: 'object' } } },
        },
        400: { $ref: '#/components/responses/BadInput' },
    },
    summary: 'Parse variant string representation',
    tags: ['General'],
};

const GET_SCHEMA = {
    parameters: [
        { $ref: '#/components/parameters/Accept' },
    ],
    responses: {
        200: {
            content: { 'application/json': { schema: { type: 'object' } } },
        },

    },
    summary: 'Returns a JSON representation of the current database schema',
    tags: ['Metadata'],
};


const GET_VERSION = {
    parameters: [
        { $ref: '#/components/parameters/Accept' },
    ],
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: {
                        properties: {
                            api: { description: 'Version of the API', example: '0.6.3', type: 'string' },
                            db: { description: 'Name of the database the API is connected to', example: 'kbapi_v0.6.3', type: 'string' },
                            schema: { description: 'Version of the schema package used to build the database', example: '1.2.1', type: 'string' },
                        },
                        type: 'object',
                    },
                },
            },
        },
    },
    summary: 'Returns the version information for the API and database',
    tags: ['Metadata'],
};


const GET_STATS = {
    parameters: [
        { $ref: '#/components/parameters/Accept' },
        { $ref: '#/components/parameters/Authorization' },
        { $ref: '#/components/parameters/history' },
        {
            description: 'Group counts by this property',
            in: 'query',
            name: 'groupBy',
            schema: {
                default: '', enum: groupableParams, example: 'source', type: 'string',
            },
        },
        {
            description: 'List of db classes to create counts for',
            in: 'query',
            name: 'classList',
            schema: {
                example: 'Statement',
                pattern: `^(${Object.values(schema).filter(model => !model.isAbstract).map(model => model.name).join('|')})+$`,
                type: 'string',
            },
        },
    ],
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: {
                        example: {
                            result: {
                                AliasOf: 142363,
                                AnatomicalEntity: 25613,
                                CatalogueVariant: 0,
                                CategoryVariant: 545,
                                CdsPosition: 0,
                                Cites: 0,
                                ClinicalTrial: 0,
                                CytobandPosition: 0,
                                DeprecatedBy: 15673,
                                Disease: 41569,
                                ElementOf: 22,
                                EvidenceLevel: 9,
                                ExonicPosition: 0,
                                Feature: 97496,
                                GenomicPosition: 0,
                                Infers: 0,
                                IntronicPosition: 0,
                                OppositeOf: 15,
                                Pathway: 0,
                                Permissions: 0,
                                PositionalVariant: 3234,
                                ProteinPosition: 0,
                                Publication: 3347,
                                Signature: 0,
                                Source: 11,
                                Statement: 7677,
                                SubClassOf: 66691,
                                TargetOf: 0,
                                Therapy: 69382,
                                User: 8,
                                UserGroup: 17,
                                Vocabulary: 163,
                            },
                        },
                        properties: {
                            result: {
                                additionalProperties: {
                                    description: 'The number of records in this grouping (usually just by class)',
                                    type: 'integer',
                                },
                                type: 'object',
                            },
                        },
                        type: 'object',
                    },
                },
            },
        },
        400: { $ref: '#/components/responses/BadInput' },
        401: { $ref: '#/components/responses/NotAuthorized' },
    },
    summary: 'Returns counts for all non-abstract database classes',
    tags: ['Metadata'],
};


const QUERY = {
    requestBody: {
        content: {
            'application/json': {
                schema: {
                    $ref: '#/components/schemas/Query',
                },
            },
        },
        required: true,
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    properties: {
                        result: {
                            items: { $ref: '#/components/schemas/V' },
                            type: 'array',
                        },
                    },
                    required: ['result'],
                    type: 'object',
                },
            },
        },
    },
    summary: 'Query the database',
    tags: ['General'],
};


const POST_SIGN_LICENSE = {
    responses: {
        200: {
            content: {
                'application/json': {
                    $ref: '#/components/schemas/User',
                },
            },
        },
    },
    summary: 'Set the user sign off on the current license',
    tags: ['General'],
};

const GET_LICENSE = {
    requestBody: {
        content: {
            'application/json': {
                schema: {
                    $ref: '#/components/schemas/LicenseAgreement',
                },
            },
        },
        required: true,
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    $ref: '#/components/schemas/LicenseAgreement',
                },
            },
        },
    },
    summary: 'Get the current license user agreement',
    tags: ['General'],
};

const POST_LICENSE = {
    responses: {
        200: {
            content: {
                'application/json': {
                    $ref: '#/components/schemas/LicenseAgreement',
                },
            },
        },
    },
    summary: 'Get the current license user agreement',
    tags: ['General'],
};

module.exports = {
    GET_LICENSE,
    GET_SCHEMA,
    GET_STATS,
    GET_VERSION,
    POST_LICENSE,
    POST_PARSE,
    POST_SIGN_LICENSE,
    POST_TOKEN,
    QUERY,
};
