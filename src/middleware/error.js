const HTTP_STATUS = require('http-status-codes');

const { error: { AttributeError } } = require('@bcgsc/knowledgebase-schema');

const {
    DatabaseConnectionError,
    NoRecordFoundError,
    RecordExistsError,
    AuthenticationError,
    PermissionError,
} = require('../repo/error');
const { logger } = require('../repo/logging');


/**
 * Main error handling for responding to the request
 *
 * @param {GraphKBRequest} req
 */
const errorHandler = async (err, req, res, next) => {
    const { reconnectDb } = req;
    let code = err.code || HTTP_STATUS.INTERNAL_SERVER_ERROR;

    if (err instanceof PermissionError) {
        code = HTTP_STATUS.FORBIDDEN;
    } else if (err instanceof AuthenticationError) {
        code = HTTP_STATUS.UNAUTHORIZED;
    } else if (err instanceof AttributeError) {
        code = HTTP_STATUS.BAD_REQUEST;
    } else if (err instanceof NoRecordFoundError) {
        code = HTTP_STATUS.NOT_FOUND;
    } else if (err instanceof RecordExistsError) {
        code = HTTP_STATUS.CONFLICT;
    } else if (err instanceof DatabaseConnectionError) {
        logger.warn('connection error, attempting to restart the database connection');

        try {
            await reconnectDb();
        } catch (secondErr) {}
    } else {
        logger.info('unexpected error');
        logger.error(err);
        logger.error(err.stack);
    }
    if (res.headersSent) {
        return next(err);
    }
    const errorContent = err.toJSON
        ? err.toJSON()
        : { message: err.toString(), ...err };

    return res.status(code).json(errorContent);
};


module.exports = errorHandler;
