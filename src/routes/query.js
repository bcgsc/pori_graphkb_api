const jc = require('json-cycle');

const { error: { AttributeError } } = require('@bcgsc-pori/graphkb-schema');
const { logger } = require('../repo/logging');
const { parse } = require('../repo/query_builder');
const { select } = require('../repo/commands');
const { NoRecordFoundError } = require('../repo/error');

/**
 * Route to query the db
 *
 * @param {AppServer} app the GraphKB app server
 */
const addQueryRoute = (app) => {
    logger.log('verbose', 'NEW ROUTE [POST] /query');
    app.router.post(
        '/query',
        async (req, res, next) => {
            const { body } = req;

            if (!body) {
                return next(new AttributeError(
                    { message: 'request body is required' },
                ));
            }
            if (!body.target) {
                return next(new AttributeError(
                    { message: 'request body.target is required. Must specify the class being queried' },
                ));
            }
            let query;

            try {
                query = parse(body);
            } catch (err) {
                return next(err);
            }

            let session;

            try {
                session = await app.pool.acquire();
            } catch (err) {
                return next(err);
            }

            try {
                const result = await select(session, query, { user: req.user });

                if (query.expectedCount() !== null && result.length !== query.expectedCount()) {
                    throw new NoRecordFoundError(`expected ${query.expectedCount()} records but only found ${result.length}`);
                }
                session.close();
                return res.json(jc.decycle({ metadata: { records: result.length }, result }));
            } catch (err) {
                session.close();
                logger.log('debug', err);
                return next(err);
            }
        },
    );
};

module.exports = { addQueryRoute };
