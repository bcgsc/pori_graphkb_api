const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');
const _ = require('lodash');
const express = require('express');

const {
    util: { looksLikeRID },
    error: { AttributeError },
    schema: schemaDefn,
} = require('@bcgsc/knowledgebase-schema');

const {
    NoRecordFoundError,
} = require('./../repo/error');
const { logger } = require('./../repo/logging');
const {
    select, create, update, remove,
} = require('./../repo/commands');
const { checkClassPermissions } = require('./../middleware/auth');
const { parse } = require('./../repo/query_builder');
const { OPERATORS } = require('../repo/query_builder/constants');


const router = express.Router({ mergeParams: true });

const modelRouteParam = (method) => {
    const models = [];

    for (const model of Object.values(schemaDefn.schema)) {
        if (model.name === 'LicenseAgreement') {
            continue;
        }
        if (method === 'PATCH' && model.isEdge) {
            continue;
        }
        if (model.routes[method] || !method) {
            models.push(model.routeName);
        }
    }
    return `:model(${models.map(m => m.slice(1)).sort().join('|')})`;
};


router.use(`/${modelRouteParam()}`, (req, res, next) => {
    const { params: { model: routeName } } = req;
    req.model = schemaDefn.getFromRoute(`/${routeName}`);
    return next();
});


router.use(`/${modelRouteParam()}`, checkClassPermissions);


const activeRidQuery = (model, rid, opt = {}) => {
    const query = parse({
        ...opt,
        filters: { '@this': model.name, operator: OPERATORS.INSTANCEOF },
        history: false,
        target: [rid],
    });
    return query;
};

/**
 * POST route to create new records
 *
 * @param {AppServer} app the GraphKB app server
 * @param {ClassModel} model the model the routes are created for
 */
router.post(`/${modelRouteParam('POST')}`, async (req, res, next) => {
    const { dbPool, model } = req;

    if (!_.isEmpty(req.query)) {
        return next(new AttributeError(
            { message: 'No query parameters are allowed for this query type', params: req.query },
        ));
    }
    let session;

    try {
        session = await dbPool.acquire();
    } catch (err) {
        return next(err);
    }

    try {
        const result = await create(session, {
            content: req.body, model, user: req.user,
        });
        session.close();
        return res.status(HTTP_STATUS.CREATED).json(jc.decycle({ result }));
    } catch (err) {
        session.close();
        logger.log('debug', err.toString());

        if (err instanceof NoRecordFoundError) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
        }
        return next(err);
    }
});


/**
 * Route to update a record given its RID
 *
 * @param {AppServer} app the GraphKB app server
 * @param {ClassModel} model the model the routes are created for
 */
router.patch(`/${modelRouteParam('PATCH')}/:rid`, async (req, res, next) => {
    const { model, dbPool } = req;

    if (!looksLikeRID(req.params.rid, false)) {
        return next(new AttributeError(
            { message: `ID does not look like a valid record ID: ${req.params.rid}` },
        ));
    }
    const rid = `#${req.params.rid.replace(/^#/, '')}`;

    if (!_.isEmpty(req.query)) {
        return next(new AttributeError(
            { message: 'Query parameters are not allowed for this query type', params: req.query },
        ));
    }
    let session;

    try {
        session = await dbPool.acquire();
    } catch (err) {
        return next(err);
    }

    try {
        const result = await update(session, {
            changes: req.body,
            model,
            query: activeRidQuery(model, rid),
            user: req.user,
        });
        session.close();
        return res.json(jc.decycle({ result }));
    } catch (err) {
        session.close();
        return next(err);
    }
});


/**
 * Get a record by RID
 *
 * @param {AppServer} app the GraphKB app server
 * @param {ClassModel} model the model the routes are created for
 */
router.get(`/${modelRouteParam('GET')}/:rid`, async (req, res, next) => {
    const { dbPool, model } = req;
    const { neighbors = 0, ...extra } = req.query;

    if (Object.keys(extra).length > 0) {
        return next(new AttributeError(`Did not recognize the query parameter: ${Object.keys(extra).sort().join(' ')}`));
    }
    let query;

    try {
        query = activeRidQuery(model, req.params.rid, { neighbors });
    } catch (err) {
        if (err instanceof AttributeError) {
            return next(err);
        }
        logger.log('error', err.stack || err);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
    }
    let session;

    try {
        session = await dbPool.acquire();
    } catch (err) {
        return next(err);
    }

    try {
        const [result] = await select(session, query, {
            exactlyN: 1,
            user: req.user,
        });
        session.close();
        return res.json(jc.decycle({ result }));
    } catch (err) {
        session.close();
        return next(err);
    }
});


/**
 * Route to delete/remove a resource
 *
 * @param {AppServer} app the GraphKB app server
 * @param {ClassModel} model the model the routes are created for
 */
router.delete(`/${modelRouteParam('DELETE')}/:rid`, async (req, res, next) => {
    const { dbPool, model } = req;
    let { rid } = req.params;

    if (!looksLikeRID(rid, false)) {
        return next(new AttributeError(
            { message: `ID does not look like a valid record ID: ${rid}` },
        ));
    }
    rid = `#${rid.replace(/^#/, '')}`;

    if (!_.isEmpty(req.query)) {
        return next(new AttributeError(
            { message: 'No query parameters are allowed for this query type' },
        ));
    }
    let session;

    try {
        session = await dbPool.acquire();
    } catch (err) {
        return next(err);
    }

    try {
        const result = await remove(
            session, {
                model,
                query: activeRidQuery(model, rid),
                user: req.user,
            },
        );
        session.close();
        return res.json(jc.decycle({ result }));
    } catch (err) {
        session.close();
        logger.log('debug', err);
        return next(err);
    }
});


module.exports = router;
