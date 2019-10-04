const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');
const _ = require('lodash');

const {util: {looksLikeRID}, error: {AttributeError}} = require('@bcgsc/knowledgebase-schema');

const {
    NoRecordFoundError
} = require('./../repo/error');
const {logger} = require('./../repo/logging');
const {
    select, create, update, remove
} = require('./../repo/commands');
const {checkClassPermissions} = require('./../middleware/auth');
const {parse} = require('./../repo/query_builder');

const {checkStandardOptions} = require('../repo/query_builder/util');


const activeRidQuery = (model, rid, opt = {}) => {
    const query = parse({
        target: [rid],
        filters: {'@class': model.name},
        history: false,
        ...opt
    });
    return query;
};


/**
 * Get a record by RID
 *
 * @param {AppServer} app the GraphKB app server
 * @param {ClassModel} model the model the routes are created for
 */
const getRoute = (app, model) => {
    logger.log('verbose', `NEW ROUTE [GET] ${model.routeName}`);
    app.router.get(`${model.routeName}/:rid`,
        async (req, res, next) => {
            const {neighbors = 0, ...extra} = req.query;
            if (Object.keys(extra).length > 0) {
                return next(new AttributeError(`Did not recognize the query parameter: ${Object.keys(extra).sort().join(' ')}`));
            }
            let query;
            try {
                query = activeRidQuery(model, req.params.rid, {neighbors});
            } catch (err) {
                if (err instanceof AttributeError) {
                    return next(err);
                }
                logger.log('error', err.stack || err);
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(err);
            }
            let session;
            try {
                session = await app.pool.acquire();
            } catch (err) {
                return next(err);
            }
            try {
                const [result] = await select(session, query, {
                    exactlyN: 1,
                    user: req.user
                });
                session.close();
                return res.json(jc.decycle({result}));
            } catch (err) {
                session.close();
                return next(err);
            }
        });
};

/**
 * POST route to create new records
 *
 * @param {AppServer} app the GraphKB app server
 * @param {ClassModel} model the model the routes are created for
 */
const postRoute = (app, model) => {
    logger.log('verbose', `NEW ROUTE [POST] ${model.routeName}`);
    app.router.post(model.routeName,
        async (req, res, next) => {
            if (!_.isEmpty(req.query)) {
                return next(new AttributeError(
                    {message: 'No query parameters are allowed for this query type', params: req.query}
                ));
            }
            let session;
            try {
                session = await app.pool.acquire();
            } catch (err) {
                return next(err);
            }
            try {
                const result = await create(session, {
                    model, content: req.body, user: req.user, schema: app.schema
                });
                session.close();
                return res.status(HTTP_STATUS.CREATED).json(jc.decycle({result}));
            } catch (err) {
                session.close();
                logger.log('debug', err.toString());
                if (err instanceof NoRecordFoundError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                return next(err);
            }
        });
};


/**
 * Route to update a record given its RID
 *
 * @param {AppServer} app the GraphKB app server
 * @param {ClassModel} model the model the routes are created for
 */
const updateRoute = (app, model) => {
    logger.log('verbose', `NEW ROUTE [UPDATE] ${model.routeName}`);

    app.router.patch(`${model.routeName}/:rid`,
        async (req, res, next) => {
            if (!looksLikeRID(req.params.rid, false)) {
                return next(new AttributeError(
                    {message: `ID does not look like a valid record ID: ${req.params.rid}`}
                ));
            }
            const rid = `#${req.params.rid.replace(/^#/, '')}`;
            if (!_.isEmpty(req.query)) {
                return next(new AttributeError(
                    {message: 'Query parameters are allowed for this query type', params: req.query}
                ));
            }
            let session;
            try {
                session = await app.pool.acquire();
            } catch (err) {
                return next(err);
            }
            try {
                const result = await update(session, {
                    model,
                    changes: req.body,
                    query: activeRidQuery(model, rid),
                    user: req.user,
                    schema: app.schema
                });
                session.close();
                return res.json(jc.decycle({result}));
            } catch (err) {
                session.close();
                return next(err);
            }
        });
};

/**
 * Route to delete/remove a resource
 *
 * @param {AppServer} app the GraphKB app server
 * @param {ClassModel} model the model the routes are created for
 */
const deleteRoute = (app, model) => {
    logger.log('verbose', `NEW ROUTE [DELETE] ${model.routeName}`);
    app.router.delete(`${model.routeName}/:rid`,
        async (req, res, next) => {
            let {rid} = req.params;
            if (!looksLikeRID(rid, false)) {
                return next(new AttributeError(
                    {message: `ID does not look like a valid record ID: ${rid}`}
                ));
            }
            rid = `#${rid.replace(/^#/, '')}`;
            if (!_.isEmpty(req.query)) {
                return next(new AttributeError(
                    {message: 'No query parameters are allowed for this query type'}
                ));
            }
            let session;
            try {
                session = await app.pool.acquire();
            } catch (err) {
                return next(err);
            }
            try {
                const result = await remove(
                    session, {
                        query: activeRidQuery(model, rid),
                        user: req.user,
                        model
                    }
                );
                session.close();
                return res.json(jc.decycle({result}));
            } catch (err) {
                session.close();
                logger.log('debug', err);
                return next(err);
            }
        });
};


/*
 * add basic CRUD methods for any standard db class
 *
 * can add get/post/delete methods to a router
 *
 * example:
 *      router.route('/feature') = resource({model: <ClassModel>, db: <OrientDB conn>, reqQueryParams: ['source', 'name', 'biotype']});
 */
const addResourceRoutes = (app, model) => {
    // attach the db model required for checking class permissions
    app.router.use(model.routeName, (req, res, next) => {
        req.model = model;
        next();
    });
    app.router.use(model.routeName, checkClassPermissions);

    if (model.expose.GET) {
        getRoute(app, model);
    }
    if (model.expose.POST) {
        postRoute(app, model);
    }
    if (model.expose.DELETE) {
        deleteRoute(app, model);
    }
    if (model.expose.PATCH && !model.isEdge) {
        updateRoute(app, model);
    }
};


module.exports = {
    addResourceRoutes, checkStandardOptions
};
