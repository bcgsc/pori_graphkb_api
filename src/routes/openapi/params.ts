/**
 * Parameter definitions (components/params) for use in generating the swagger specification
 */
/**
 * @constant
 * @ignore
 */
const { MAX_JUMPS, MAX_QUERY_LIMIT, DEFAULT_QUERY_LIMIT } = require('./constants');

const GENERAL_QUERY_PARAMS = {
    count: {
        description: 'Return a count of the records for this query instead of the query itself',
        in: 'query',
        name: 'count',
        nullable: false,
        schema: { type: 'boolean' },
    },
    createdAt: {
        description: 'The timestamp when the record was created',
        in: 'query',
        name: 'createdAt',
        nullable: false,
        schema: { type: 'integer' },
    },
    deletedAt: {
        description: 'The timestamp when the record was deleted',
        in: 'query',
        name: 'deletedAt',
        nullable: true,
        schema: { type: 'integer' },
    },
    history: {
        description: 'Include deleted records in the query result',
        in: 'query',
        name: 'history',
        schema: {
            default: false,
            type: 'boolean',
        },
    },
    limit: {
        default: DEFAULT_QUERY_LIMIT,
        description: 'Limits the number of records to return (useful for paginating queries)',
        in: 'query',
        name: 'limit',
        schema: {
            maximum: MAX_QUERY_LIMIT,
            minimum: 1,
            type: 'integer',
        },
    },
    neighbors: {
        description: 'Return neighbors of the selected record(s) up to \'n\' edges away. If this is set to 0, no neighbors will be returned. To collect all immediate neighbors this must be set to 2.',
        in: 'query',
        name: 'neighbors',
        schema: {
            maximum: MAX_JUMPS,
            minimum: 0,
            type: 'integer',
        },
    },
    or: {
        description: 'CSV list of class properties which should be joined as an OR statment instead of the default AND',
        in: 'query',
        name: 'or',
        nullable: false,
        schema: { type: 'string' },
    },
    orderBy: {
        description: 'CSV list of properties to order the results by',
        in: 'query',
        name: 'orderBy',
        nullable: false,
        schema: { type: 'string' },
    },
    orderByDirection: {
        description: 'When orderBy is given, this property is used to determine the direction of that ordering',
        in: 'query',
        name: 'orderByDirection',
        nullable: false,
        schema: { enum: ['ASC', 'DESC'], type: 'string' },
    },
    returnProperties: {
        description: 'CSV list of attributes to return. Returns the whole record if not specified',
        in: 'query',
        name: 'returnProperties',
        schema: {
            type: 'string',
        },
    },
    skip: {
        description: 'Number of records to skip (useful for paginating queries)',
        in: 'query',
        name: 'skip',
        schema: {
            minimum: 1,
            type: 'integer',
        },
    },
};

const ONTOLOGY_QUERY_PARAMS = {
    subsets: {
        description: 'Check if an ontology term belongs to a given subset',
        in: 'query',
        name: 'subsets',
        schema: {
            type: 'string',
        },
    },
};

const BASIC_HEADER_PARAMS = {
    Accept: {
        description: 'The content type you expect to recieve. Currently only supports application/json',
        in: 'header',
        name: 'Accept',
        required: true,
        schema: {
            enum: ['application/json'],
            type: 'string',
        },
    },
    Authorization: {
        description: 'Token containing the user information/authentication',
        in: 'header',
        name: 'Authorization',
        required: true,
        schema: {
            format: 'token',
            type: 'string',
        },
    },
    'Content-Type': {
        description: 'The content type you expect to send. Currently only supports application/json',
        in: 'header',
        name: 'Content-Type',
        required: true,
        schema: {
            enum: ['application/json'],
            type: 'string',
        },
    },
};

export { BASIC_HEADER_PARAMS, GENERAL_QUERY_PARAMS, ONTOLOGY_QUERY_PARAMS };
