/**
 * Reuseable response (components/responses) definitions for generating the swagger specification
 */
/**
 * @constant
 * @ignore
 */
const Forbidden = {
    content: {
        'application/json': {
            schema: {
                $ref: '#/components/schemas/Error',
                properties: { name: { example: 'PermissionError' } },
            },
        },
    },
    description: 'The current user does not have the required permissions to access this content',
};
const NotAuthorized = {
    content: {
        'application/json': {
            schema: {
                $ref: '#/components/schemas/Error',
            },
        },
    },
    description: 'Authorization failed or insufficient permissions were found',
};
const RecordExistsError = {
    content: {
        'application/json': {
            schema: {
                $ref: '#/components/schemas/Error',
                properties: { name: { example: 'RecordExistsError' } },
            },
        },
    },
    description: 'The record cannot be created, the record already exists',
};
const BadInput = {
    content: {
        'application/json': {
            schema: {
                $ref: '#/components/schemas/Error',
                properties: { name: { example: 'AttributeError' } },
            },
        },
    },
    description: 'Bad request contains invalid input',
};

const RecordNotFound = {
    content: {
        'application/json': {
            schema: {
                $ref: '#/components/schemas/Error',
            },
        },
    },
    description: 'The record does not exist',
};

module.exports = {
    BadInput, Forbidden, NotAuthorized, RecordExistsError, RecordNotFound,
};
