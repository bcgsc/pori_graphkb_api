/**
 * Route definition components (components/routes) that cannot be auto generated only from the schema
 * @module app/routes/openapi/routes
 */


const POST_TOKEN = {
    summary: 'Generate an authentication token to be used for requests to the KB API server',
    tags: ['General'],
    parameters: [
        { $ref: '#/components/parameters/Content-Type' },
        { $ref: '#/components/parameters/Accept' },
    ],
    requestBody: {
        required: true,
        content: {
            'application/json': {
                schema: {
                    anyOf: [
                        {
                            type: 'object',
                            properties: {
                                username: { type: 'string', description: 'The username' },
                                password: { type: 'string', description: 'The password associated with this username' },
                            },
                        },
                        {
                            type: 'object',
                            properties: {
                                keyCloakToken: { type: 'string', description: 'The token from keycloak' },
                            },
                        },
                    ],
                },
            },
        },
    },
    responses: {
        200: {
            description: 'The user is valid and a token has been generated',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            kbToken: {
                                type: 'string',
                                format: 'token',
                                description: 'The token for KB API requests',
                            },
                            keyCloakToken: {
                                type: 'string',
                                format: 'token',
                                description: 'The token from keycloak',
                            },
                        },
                    },
                },
            },
        },
        401: {
            description: 'The credentials were incorrect or not found',
        },
    },
};


const POST_PARSE = {
    summary: 'Parse variant string representation',
    tags: ['General'],
    requestBody: {
        required: true,
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    required: ['content'],
                    properties: {
                        content: { type: 'string', description: 'the variant string representation', example: 'KRAS:p.G12D' },
                        requiredFeatures: { type: 'boolean', description: 'flag to indicate features are not required in the variant string' },
                    },
                },
            },
        },
    },
    responses: {
        200: {
            content: { 'application/json': { schema: { type: 'object' } } },
        },
        400: { $ref: '#/components/responses/BadInput' },
    },
};

const GET_SCHEMA = {
    summary: 'Returns a JSON representation of the current database schema',
    tags: ['Metadata'],
    parameters: [
        { $ref: '#/components/parameters/Accept' },
    ],
    responses: {
        200: {
            content: { 'application/json': { schema: { type: 'object' } } },
        },

    },
};


const GET_VERSION = {
    summary: 'Returns the version information for the API and database',
    tags: ['Metadata'],
    parameters: [
        { $ref: '#/components/parameters/Accept' },
    ],
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            api: { type: 'string', description: 'Version of the API', example: '0.6.3' },
                            db: { type: 'string', description: 'Name of the database the API is connected to', example: 'kbapi_v0.6.3' },
                            schema: { type: 'string', description: 'Version of the schema package used to build the database', example: '1.2.1' },
                        },
                    },
                },
            },
        },
    },
};


const GET_STATS = {
    summary: 'Returns counts for all non-abstract database classes',
    tags: ['Metadata'],
    parameters: [
        { $ref: '#/components/parameters/Accept' },
        { $ref: '#/components/parameters/Authorization' },
        { $ref: '#/components/parameters/history' },
        {
            in: 'query',
            name: 'groupBySource',
            schema: { type: 'boolean', default: false },
            description: 'Count by class and source versus only by class',
        },
    ],
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            result: {
                                type: 'object',
                                additionalProperties: {
                                    type: 'integer',
                                    description: 'The number of records in this grouping (usually just by class)',
                                },
                            },
                        },
                        example: {
                            result: {
                                UserGroup: 17,
                                Permissions: 0,
                                User: 8,
                                Source: 11,
                                EvidenceLevel: 9,
                                ClinicalTrial: 0,
                                Publication: 3347,
                                Therapy: 69382,
                                Feature: 97496,
                                ProteinPosition: 0,
                                CytobandPosition: 0,
                                GenomicPosition: 0,
                                ExonicPosition: 0,
                                IntronicPosition: 0,
                                CdsPosition: 0,
                                PositionalVariant: 3234,
                                CategoryVariant: 545,
                                Statement: 7677,
                                AnatomicalEntity: 25613,
                                Disease: 41569,
                                Pathway: 0,
                                Signature: 0,
                                Vocabulary: 163,
                                CatalogueVariant: 0,
                                AliasOf: 142363,
                                Cites: 0,
                                DeprecatedBy: 15673,
                                ElementOf: 22,
                                Infers: 0,
                                OppositeOf: 15,
                                SubClassOf: 66691,
                                TargetOf: 0,
                            },
                        },
                    },
                },
            },
        },
        401: { $ref: '#/components/responses/NotAuthorized' },
        400: { $ref: '#/components/responses/BadInput' },
    },
};


const QUERY = {
    summary: 'Query the database',
    tags: ['General'],
    requestBody: {
        required: true,
        content: {
            'application/json': {
                schema: {
                    $ref: '#/components/schemas/Query',
                },
            },
        },
    },
    responses: {
        200: {
            content: {
                'application/json': {
                    type: 'object',
                    required: ['result'],
                    properties: {
                        result: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/V' },
                        },
                    },
                },
            },
        },
    },
};

module.exports = {
    POST_TOKEN,
    POST_PARSE,
    GET_SCHEMA,
    GET_STATS,
    GET_VERSION,
    QUERY,
};
