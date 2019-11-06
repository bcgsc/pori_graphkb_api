const HTTP_STATUS = require('http-status-codes');

const { error: { AttributeError } } = require('@bcgsc/knowledgebase-schema');

const {
    DatabaseConnectionError, NoRecordFoundError, RecordExistsError,
} = require('./../repo/error');
const { logger } = require('./../repo/logging');


/**
 * Main error handling for responding to the request
 *
 * @param {AppServer} app the main application server
 */
const addErrorRoute = (app) => {
    app.router.use(async (err, req, res, next) => {
        let code = err.code || HTTP_STATUS.INTERNAL_SERVER_ERROR;

        logger.info('unexpected error');
        logger.log('error', err.stack);

        if (err instanceof AttributeError) {
            code = HTTP_STATUS.BAD_REQUEST;
        } else if (err instanceof NoRecordFoundError) {
            code = HTTP_STATUS.NOT_FOUND;
        } else if (err instanceof RecordExistsError) {
            code = HTTP_STATUS.CONFLICT;
        } else if (err instanceof DatabaseConnectionError) {
            logger.warn('connection error, attempting to restart the database connection');

            try {
                await app.connectToDb();
            } catch (secondErr) {}
        }
        if (res.headersSent) {
            return next(err);
        }
        const errorContent = err.toJSON
            ? err.toJSON()
            : { message: err.toString(), ...err };

        return res.status(code).json(errorContent);
    });
};

module.exports = { addErrorRoute };
