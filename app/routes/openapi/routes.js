/**
 * Route definition components (components/routes) that cannot be auto generated only from the schema
 * @module app/routes/openapi/routes
 */


const POST_STATEMENT = {
    summary: 'Add a new statement',
    tags: ['Statement'],
    parameters: [
        {$ref: '#/components/parameters/Content-Type'},
        {$ref: '#/components/parameters/Accept'},
        {$ref: '#/components/parameters/Authorization'}
    ],
    requestBody: {
        required: true,
        content: {
            'application/json': {
                schema: {
                    allOf: [{$ref: '#/components/schemas/Statement'}],
                    type: 'object',
                    required: ['impliedBy', 'appliesTo', 'relevance', 'supportedBy'],
                    properties: {
                        impliedBy: {
                            type: 'array',
                            items: {$ref: '#/components/schemas/PutativeEdge'},
                            description: 'A list of putative edges to be created'
                        },
                        supportedBy: {
                            type: 'array',
                            items: {$ref: '#/components/schemas/PutativeEdge'},
                            description: 'A list of putative edges to be created'
                        }
                    }
                }
            }
        }
    },
    responses: {
        201: {
            description: 'A new record was created',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            result: {$ref: '#/components/schemas/Statement'}
                        }
                    }
                }
            },
            links: {
                getById: {
                    parameters: {rid: '$response.body#/result.@rid'},
                    operationId: 'get_statements__rid_',
                    description: 'The `@rid` value returned in the response can be used as the `rid` parameter in [GET `/statements/{rid}`](.#/Statement/get_statements__rid_) requests'
                },
                patchById: {
                    parameters: {rid: '$response.body#/result.@rid'},
                    operationId: 'patch_statements__rid_',
                    description: 'The `@rid` value returned in the resnse can be used as the `rid` parameter in [PATCH `/statements/{rid}`](.#/Statement/patch_statements__rid_) requests'
                },
                deleteById: {
                    parameters: {rid: '$response.body#/result.@rid'},
                    operationId: 'delete_statements__rid_',
                    description: 'The `@rid` value returned in the response can be used as the `rid` parameter in [DELETE `/statements/{rid}`](.#/Statement/delete_statements__rid_) requests'
                }
            }
        },
        401: {$ref: '#/components/responses/NotAuthorized'},
        400: {$ref: '#/components/responses/BadInput'},
        409: {$ref: '#/components/responses/RecordExistsError'},
        403: {$ref: '#/components/responses/Forbidden'}
    }
};


const POST_TOKEN = {
    summary: 'Generate an authentication token to be used for requests to the KB API server',
    tags: ['General'],
    parameters: [
        {$ref: '#/components/parameters/Content-Type'},
        {$ref: '#/components/parameters/Accept'}
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
                                username: {type: 'string', description: 'The username'},
                                password: {type: 'string', description: 'The password associated with this username'}
                            }
                        },
                        {
                            type: 'object',
                            properties: {
                                keyCloakToken: {type: 'string', description: 'The token from keycloak'}
                            }
                        }
                    ]
                }
            }
        }
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
                                description: 'The token for KB API requests'
                            },
                            keyCloakToken: {
                                type: 'string',
                                format: 'token',
                                description: 'The token from keycloak'
                            }
                        }
                    }
                }
            }
        },
        401: {
            description: 'The credentials were incorrect or not found'
        }
    }
};


const GET_SCHEMA = {
    summary: 'Returns a JSON representation of the current database schema',
    tags: ['Metadata'],
    parameters: [
        {$ref: '#/components/parameters/Accept'}
    ],
    responses: {
        200: {
            content: {'application/json': {schema: {type: 'object'}}}
        }
    }
};


const GET_VERSION = {
    summary: 'Returns the version information for the API and database',
    tags: ['Metadata'],
    parameters: [
        {$ref: '#/components/parameters/Accept'}
    ],
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            api: {type: 'string', description: 'Version of the API', example: '0.6.3'},
                            db: {type: 'string', description: 'Name of the database the API is connected to', example: 'kbapi_v0.6.3'}
                        }
                    }
                }
            }
        }
    }
};

const GET_STATMENT_BY_KEYWORD = {
    summary: 'Search statement records by a single keyword',
    tags: ['Metadata'],
    parameters: [
        {$ref: '#/components/parameters/Accept'},
        {
            in: 'query',
            name: 'keyword',
            schema: {type: 'string'},
            example: 'kras',
            description: 'the keyword to search for',
            required: true
        },
        {$ref: '#/components/parameters/neighbors'},
        {$ref: '#/components/parameters/limit'},
        {$ref: '#/components/parameters/skip'},
        {$ref: '#/components/parameters/orderBy'},
        {$ref: '#/components/parameters/orderByDirection'},
        {$ref: '#/components/parameters/count'}
    ],
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            result: {
                                type: 'array', items: {$ref: '#/components/schemas/Statement'}
                            }
                        }
                    }
                }
            }
        },
        401: {$ref: '#/components/responses/NotAuthorized'},
        403: {$ref: '#/components/responses/Forbidden'},
        400: {$ref: '#/components/responses/BadInput'}
    }
};


const SEARCH_STATEMENT_BY_LINKS = {
    summary: 'Search for statements by their related records',
    tags: ['Statement'],
    parameters: [
        {$ref: '#/components/parameters/Content-Type'},
        {$ref: '#/components/parameters/Accept'},
        {$ref: '#/components/parameters/Authorization'}
    ],
    requestBody: {
        required: true,
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    properties: {
                        impliedBy: {
                            allOf: [{$ref: '#/components/schemas/RecordList'}],
                            description: 'search for statements implied by any of these (or related) records'
                        },
                        relevance: {
                            allOf: [{$ref: '#/components/schemas/RecordList'}],
                            description: 'search for statements where the relevance is one of these (or related) records'
                        },
                        appliesTo: {
                            allOf: [{$ref: '#/components/schemas/RecordList'}],
                            description: 'search for statements that apply to one of these (or related) records'
                        },
                        createdBy: {
                            allOf: [{$ref: '#/components/schemas/RecordList'}],
                            description: 'search for statements created by any of these users'
                        },
                        reviewedBy: {
                            allOf: [{$ref: '#/components/schemas/RecordList'}],
                            description: 'search for statements reviewed by any of these users'
                        },
                        source: {
                            allOf: [{$ref: '#/components/schemas/RecordList'}],
                            description: 'search for statements with any of these sources'
                        },
                        evidenceLevel: {
                            allOf: [{$ref: '#/components/schemas/RecordList'}],
                            description: 'search for statements with any of these evidence levels'
                        },
                        skip: {$ref: '#/components/schemas/skip'},
                        returnProperties: {$ref: '#/components/schemas/returnProperties'},
                        limit: {$ref: '#/components/schemas/limit'},
                        neighbors: {$ref: '#/components/schemas/neighbors'},
                        count: {$ref: '#/components/schemas/count'},
                        orderBy: {$ref: '#/components/schemas/orderBy'},
                        orderByDirection: {$ref: '#/components/schemas/orderByDirection'}
                    }
                }
            }
        }
    },
    responses: {
        200: {
            description: 'list of retrieved statements',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            result: {
                                type: 'array',
                                items: {$ref: '#/components/schemas/Statement'}
                            }
                        }
                    }
                }
            },
            links: {
                getById: {
                    parameters: {rid: '$response.body#/result[].@rid'},
                    operationId: 'get_statements__rid_',
                    description: 'The `@rid` value returned in the response can be used as the `rid` parameter in [GET `/statements/{rid}`](.#/Statement/get_statements__rid_) requests'
                },
                patchById: {
                    parameters: {rid: '$response.body#/result[].@rid'},
                    operationId: 'patch_statements__rid_',
                    description: 'The `@rid` value returned in the resnse can be used as the `rid` parameter in [PATCH `/statements/{rid}`](.#/Statement/patch_statements__rid_) requests'
                },
                deleteById: {
                    parameters: {rid: '$response.body#/result[].@rid'},
                    operationId: 'delete_statements__rid_',
                    description: 'The `@rid` value returned in the response can be used as the `rid` parameter in [DELETE `/statements/{rid}`](.#/Statement/delete_statements__rid_) requests'
                }
            }
        },
        401: {$ref: '#/components/responses/NotAuthorized'},
        400: {$ref: '#/components/responses/BadInput'},
        403: {$ref: '#/components/responses/Forbidden'}
    }
};


const GET_RECORDS = {
    summary: 'Get a list of records from their record IDs',
    tags: ['General'],
    parameters: [
        {$ref: '#/components/parameters/Accept'},
        {
            in: 'query',
            name: 'rid',
            schema: {type: 'string'},
            example: '69:780,59:4927,84:12673',
            description: 'the record IDs (CSV list) to search for',
            required: true
        },
        {$ref: '#/components/parameters/neighbors'}
    ],
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            result: {schema: {type: 'array', items: {type: 'object'}}}
                        },
                        description: 'The list of records from the database'
                    }
                }
            }
        },
        401: {$ref: '#/components/responses/NotAuthorized'},
        400: {$ref: '#/components/responses/BadInput'},
        403: {$ref: '#/components/responses/Forbidden'}
    }
};


const GET_STATS = {
    summary: 'Returns counts for all non-abstract database classes',
    tags: ['Metadata'],
    parameters: [
        {$ref: '#/components/parameters/Accept'},
        {$ref: '#/components/parameters/Authorization'},
        {
            in: 'query',
            name: 'grouping',
            schema: {type: 'string', enum: ['source']},
            description: 'Additional attribute to group by'
        }
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
                                    description: 'The number of records in this grouping (usually just by class)'
                                }
                            }
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
                                ImpliedBy: 7957,
                                Infers: 0,
                                OppositeOf: 15,
                                SubClassOf: 66691,
                                SupportedBy: 17582,
                                TargetOf: 0
                            }
                        }
                    }
                }
            }
        },
        401: {$ref: '#/components/responses/NotAuthorized'},
        400: {$ref: '#/components/responses/BadInput'}
    }
};

module.exports = {
    POST_STATEMENT,
    POST_TOKEN,
    GET_SCHEMA,
    GET_STATS,
    GET_VERSION,
    GET_STATMENT_BY_KEYWORD,
    GET_RECORDS,
    SEARCH_STATEMENT_BY_LINKS
};
