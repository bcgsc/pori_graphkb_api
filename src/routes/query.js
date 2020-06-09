const express = require('express');
const jc = require('json-cycle');

const { error: { AttributeError } } = require('@bcgsc/knowledgebase-schema');
const { logger } = require('./../repo/logging');
const { parse } = require('../repo/query_builder');
const { select } = require('../repo/commands');
const { NoRecordFoundError } = require('../repo/error');


const router = express.Router({ mergeParams: true });


/**
 * Route to query the db
 *
 * @param {AppServer} app the GraphKB app server
 */
router.post('/', async (req, res, next) => {
    const { body, dbPool, user } = req;

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
        session = await dbPool.acquire();
    } catch (err) {
        return next(err);
    }

    try {
        const result = await select(session, query, { user });

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
});


module.exports = router;
