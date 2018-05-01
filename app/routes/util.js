const HTTP_STATUS = require('http-status-codes');
var uuidValidate = require('uuid-validate');
const jc = require('json-cycle');
const _ = require('lodash');

const {ErrorMixin, AttributeError, NoResultFoundError, MultipleResultsFoundError} = require('./../repo/error');
const {select, create, update, remove} = require('./../repo/base');


class InputValidationError extends ErrorMixin {};
const RECORD_LIMIT = 1000;

/*
 * check that the parameters passed are expected
 */
const validateParams = async (opt) => {
    const params = Array.from(opt.params) || [];
    const required = opt.required || [];
    const optional = opt.optional || [];
    const allowNone = opt.allowNone !== undefined ? opt.allowNone : true;
    if (Object.keys(params).length == 0 && ! allowNone) {
        throw new InputValidationError('no parameters were specified');
    }
    // check that the required parameters are present
    for (let attr of required) {
        if (params.indexOf(attr) < 0) {
            throw new InputValidationError(`missing required parameter: ${attr}. Found ${params}`);
        }
    }
    // check that all parameters are expected
    for (let attr of params) {
        if (required.indexOf(attr) < 0 && optional.indexOf(attr) < 0) {
            throw new InputValidationError(`unexpected parameter: ${attr}`);
        }
    }
    return true;
};


/*
 * add basic CRUD methods for any standard db class
 *
 * can add get/post/delete methods to a router
 *
 * example:
 *      router.route('/feature') = resource({model: <ClassModel>, db: <OrientDB conn>, reqQueryParams: ['source', 'name', 'biotype']});
 */
const addResourceRoutes = (opt) => {
    const {router, model, db, cacheUpdate} = opt;
    const optQueryParams = opt.optQueryParams || _.concat(model._optional, model._required);
    optQueryParams.push('recordLimit');
    optQueryParams.push('recordStart');
    const reqQueryParams = opt.reqQueryParams || [];
    const verbose = opt.verbose === undefined ? true : false;
    const route = opt.route || `/${model.name.toLowerCase()}${model.isEdge ? '' : 's'}`;

    if (verbose) {
        console.log(`addResourceRoutes: ${route}`);
    }
    
    router.get(route, 
        async (req, res, next) => {
            //if (req.query.recordLimit === undefined) {
            //    req.query.recordLimit = RECORD_LIMIT;
            //}
            //if (req.query.recordStart === undefined) {
            //    req.query.recordStart = 0;
            //}
            try {
                validateParams({params: req.query, required: reqQueryParams, optional: optQueryParams});
            } catch (err) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                return;
            }
            try {
                const result = await select(db, {model: model, where: req.query});
                res.json(jc.decycle(result));
            } catch (err) {
                res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorToJSON(err));
            }
        });
    router.post(route, 
        async (req, res, next) => {
            if (! _.isEmpty(req.query)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'No query parameters are allowed for this query type', params: req.query});
                return;
            }
            try {
                const result = await create(db, {model: model, content: req.body, user: req.user});
                if (cacheUpdate) {
                    await cacheUpdate(db);
                }
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof AttributeError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(errorToJSON(err));
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorToJSON(err));
                }
            }
        }
    );
    router.delete(route,
        async (req, res, next) => {
            if (! _.isEmpty(req.query)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'No query parameters are allowed for this query type'});
                return;
            }
            try {
                const result = await remove(db, {model: model, where: req.body.where, user: req.user});
                if (cacheUpdate) {
                    await cacheUpdate(db);
                }
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof AttributeError || err instanceof NoResultFoundError || err instanceof MultipleResultsFoundError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(errorToJSON(err));
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorToJSON(err));
                }
            }
        }
    );
    
    // Add the id routes
    router.get(`${route}/:id`, 
        async (req, res, next) => {
            if (! uuidValidate(req.params.id) ) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: `ID does not look like a valid uuid: ${req.params.id}`});
                return;
            }
            try {
                validateParams({params: req.query, required: reqQueryParams, optional: optQueryParams});
            } catch (err) {
                res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                return;
            }
            const where = Object.assign({}, req.query, {uuid: req.params.id, deletedAt: "null"});
            try {
                const result = await select(db, {model: model, where: where, exactlyN: 1});
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof NoResultFoundError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(errorToJSON(err));
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorToJSON(err));
                }
            }
        });
    router.put(`${route}/:id`, 
        async (req, res, next) => {
            if (! uuidValidate(req.params.id) ) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: `ID does not look like a valid uuid: ${req.params.id}`});
                return;
            }
            if (! _.isEmpty(req.query)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'No query parameters are allowed for this query type', params: req.query});
                return;
            }
            try {
                const result = await update(db, {
                    model: model, 
                    content: req.body, 
                    where: {uuid: req.params.id, deletedAt: "null"}, 
                    user: req.user
                });
                if (cacheUpdate) {
                    await cacheUpdate(db);
                }
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof AttributeError || err instanceof NoResultFoundError || err instanceof MultipleResultsFoundError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(errorToJSON(err));
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorToJSON(err));
                }
            }
        }
    );
    router.delete(`${route}/:id`,
        async (req, res, next) => {
            if (! uuidValidate(req.params.id) ) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: `ID does not look like a valid uuid: ${req.params.id}`});
                return;
            }
            if (! _.isEmpty(req.query)) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({message: 'No query parameters are allowed for this query type'});
                return;
            }
            try {
                const result = await remove(db, {model: model, where: {uuid: req.params.id, deletedAt: "null"}, user: req.user});
                if (cacheUpdate) {
                    await cacheUpdate(db);
                }
                res.json(jc.decycle(result));
            } catch (err) {
                if (err instanceof AttributeError || err instanceof NoResultFoundError || err instanceof MultipleResultsFoundError) {
                    res.status(HTTP_STATUS.BAD_REQUEST).json(errorToJSON(err));
                } else {
                    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(errorToJSON(err));
                }
            }
        }
    );
};


const errorToJSON = (err) => {
    const json = {message: err.message};
    for (let attr of Object.keys(err)) {
        json[attr] = err[attr];
    }
    return json;
};


const looksLikeRID = (rid) => {
    try {
        if (/^#\d+:\d+$/.exec(rid.trim())) {
            return true;
        }
    } catch (err) {}
    return false;
}


module.exports = {validateParams, addResourceRoutes, InputValidationError, errorToJSON, looksLikeRID};