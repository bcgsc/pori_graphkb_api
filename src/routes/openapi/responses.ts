/**
 * Reuseable response (components/responses) definitions for generating the swagger specification
 */
import { OpenApiResponse } from "./types";

const Forbidden: OpenApiResponse = {
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
const NotAuthorized: OpenApiResponse = {
    content: {
        'application/json': {
            schema: {
                $ref: '#/components/schemas/Error',
            },
        },
    },
    description: 'Authorization failed or insufficient permissions were found',
};
const RecordConflictError: OpenApiResponse = {
    content: {
        'application/json': {
            schema: {
                $ref: '#/components/schemas/Error',
                properties: { name: { example: 'RecordConflictError' } },
            },
        },
    },
    description: 'The record cannot be created, the record already exists',
};
const BadInput: OpenApiResponse = {
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

const RecordNotFound: OpenApiResponse = {
    content: {
        'application/json': {
            schema: {
                $ref: '#/components/schemas/Error',
            },
        },
    },
    description: 'The record does not exist',
};

export {
    BadInput, Forbidden, NotAuthorized, RecordConflictError, RecordNotFound,
};
