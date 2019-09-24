const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');
const _ = require('lodash');

const {util: {looksLikeRID, castToRID}, error: {AttributeError}} = require('@bcgsc/knowledgebase-schema');

const {
    NoRecordFoundError, RecordExistsError
} = require('./../repo/error');
const {logger} = require('./../repo/logging');
const {
    select, searchSelect, create, update, remove
} = require('./../repo/commands');
const {checkClassPermissions} = require('./../middleware/auth');
const {Query} = require('./../repo/query');

const {parse: parseQueryLanguage, checkStandardOptions} = require('./query');


const activeRidQuery = (schema, model, rid) => {
    const query = Query.parse(schema, model, {
        where: [
            {attr: {attr: '@rid', cast: castToRID}, value: rid}
        ],
        activeOnly: true
    });
    query.validate();
    return query;
};


/**
 * Query a record class
 *
 * @param {AppServer} app the GraphKB app server
 * @param {ClassModel} model the model the routes are created for
 */
const queryRoute = (app, model) => {
    logger.log('verbose', `NEW ROUTE [QUERY] GET ${model.routeName}`);

    app.router.get(model.routeName,
        async (req, res, next) => {
            let query;
            try {
                if (req.query['@rid'] !== undefined) {
                    throw new AttributeError('This route does not allow search by @rid. Please use the /records route instead');
                }
                const options = parseQueryLanguage(checkStandardOptions(req.query));
                query = Query.parse(app.schema, model, options);
                query.validate();
            } catch (err) {
                logger.log('debug', err);
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                return next(err);
            }
            let session;
            try {
                session = await app.pool.acquire();
            } catch (err) {
                return next(err);
            }
            try {
                const result = await select(session, query, {user: req.user});
                session.close();
                return res.json(jc.decycle({result}));
            } catch (err) {
                session.close();
                logger.log('debug', err);
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                return next(err);
            }
        });
};

/**
 * @param {AppServer} app the GraphKB app server
 * @param {ClassModel} model the model the routes are created for
 */
const searchRoute = (app, model) => {
    logger.log('verbose', `NEW ROUTE [SEARCH] POST ${model.routeName}/search`);
    app.router.post(`${model.routeName}/search`,
        async (req, res, next) => {
            if (!_.isEmpty(req.query)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
                    {message: 'No query parameters are allowed for this query type', params: req.query}
                ));
            }
            if (req.body.where && req.body.search) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
                    {message: 'Where and search are mutually exclusive', params: req.body}
                ));
            } if (req.body.search) {
                // search
                let session;
                try {
                    session = await app.pool.acquire();
                } catch (err) {
                    return next(err);
                }
                try {
                    const result = await searchSelect(session, {
                        ...checkStandardOptions(req.body), model, user: req.user
                    });
                    session.close();
                    return res.json(jc.decycle({result}));
                } catch (err) {
                    session.close();
                    logger.log('debug', err);
                    if (err instanceof AttributeError) {
                        return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                    }
                    return next(err);
                }
            } else {
                // default to the complex query
                let query;
                try {
                    query = Query.parse(app.schema, model, checkStandardOptions(req.body));
                    query.validate();
                } catch (err) {
                    logger.log('debug', err);
                    if (err instanceof AttributeError) {
                        return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                    }
                    return next(err);
                }
                let session;
                try {
                    session = await app.pool.acquire();
                } catch (err) {
                    return next(err);
                }
                try {
                    const result = await select(session, query, {user: req.user});
                    session.close();
                    return res.json(jc.decycle({result}));
                } catch (err) {
                    session.close();
                    logger.log('debug', err);
                    if (err instanceof AttributeError) {
                        return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                    }
                    return next(err);
                }
            }
        });
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
                return res
                    .status(HTTP_STATUS.BAD_REQUEST)
                    .json(new AttributeError(`Did not recognize the query parameter: ${Object.keys(extra).sort().join(' ')}`));
            }
            let query;
            try {
                const target = `[${castToRID(req.params.rid)}]`;
                query = Query.parse(app.schema, model, {
                    where: [],
                    target,
                    neighbors
                });
                query.validate();
            } catch (err) {
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
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
                if (err instanceof NoRecordFoundError) {
                    return res.status(HTTP_STATUS.NOT_FOUND).json(err);
                }
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
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
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
                if (err instanceof AttributeError || err instanceof NoRecordFoundError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } if (err instanceof RecordExistsError) {
                    return res.status(HTTP_STATUS.CONFLICT).json(err);
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
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
                    {message: `ID does not look like a valid record ID: ${req.params.rid}`}
                ));
            }
            const rid = `#${req.params.rid.replace(/^#/, '')}`;
            if (!_.isEmpty(req.query)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
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
                    query: activeRidQuery(app.schema, model, rid),
                    user: req.user,
                    schema: app.schema
                });
                session.close();
                return res.json(jc.decycle({result}));
            } catch (err) {
                session.close();
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } if (err instanceof NoRecordFoundError) {
                    return res.status(HTTP_STATUS.NOT_FOUND).json(err);
                } if (err instanceof RecordExistsError) {
                    return res.status(HTTP_STATUS.CONFLICT).json(err);
                }
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
            if (!looksLikeRID(req.params.rid, false)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
                    {message: `ID does not look like a valid record ID: ${req.params.rid}`}
                ));
            }
            req.params.rid = `#${req.params.rid.replace(/^#/, '')}`;
            if (!_.isEmpty(req.query)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
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
                const query = activeRidQuery(app.schema, model, req.params.rid);
                const result = await remove(
                    session, {
                        query, user: req.user, model
                    }
                );
                session.close();
                return res.json(jc.decycle({result}));
            } catch (err) {
                session.close();
                logger.log('debug', err);
                if (err instanceof AttributeError) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                } if (err instanceof NoRecordFoundError) {
                    return res.status(HTTP_STATUS.NOT_FOUND).json(err);
                }
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

    if (model.expose.QUERY) {
        queryRoute(app, model);
    }
    if (model.expose.QUERY && !model.isEdge) {
        searchRoute(app, model);
    }
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
