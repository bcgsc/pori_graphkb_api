const _ = require('lodash');
const jc = require('json-cycle');
const HTTP_STATUS = require('http-status-codes');
const { ValidationError } = require('@bcgsc-pori/graphkb-schema');

const { checkHgvsUploadPermissions } = require('../middleware/auth');
const { logger } = require('../repo/logging');
const { getContent, uploadPositionalVariant } = require('../repo/upload/positionalvariant');

/**
 * Route to upload a PositionalVariant record
 * based on an HGVS-like notation string.
 *
 * @param {AppServer} app the GraphKB app server
 */
const addHgvsUploadRoute = (app) => {
    const hgvsUploadRoutePattern = '/upload/hgvs';

    // attach models for checking class permissions
    app.router.use(hgvsUploadRoutePattern, (req, res, next) => {
        const { body: { upload, uploadRef } } = req;

        req.models = [];

        if (upload === true) {
            req.models.push('PositionalVariant');
        }
        // TODO: Add support for Feature upload
        if (uploadRef === true) {
            req.models.push('Feature');
        }
        next();
    });
    // route-specific middleware for class permissions check
    app.router.use(hgvsUploadRoutePattern, checkHgvsUploadPermissions);

    logger.log('verbose', `NEW ROUTE [POST] ${hgvsUploadRoutePattern}`);
    app.router.post(
        hgvsUploadRoutePattern,
        async (req, res, next) => {
            const { body, query } = req;

            // Validation
            if (!_.isEmpty(query)) {
                return next(new ValidationError(
                    { message: 'No query parameters are allowed for this query type', params: query },
                ));
            }
            if (!body) {
                return next(new ValidationError(
                    { message: 'request body is required' },
                ));
            }
            if (!body.notation) {
                return next(new ValidationError(
                    { message: 'request body.notation is required. Must provide an HGVS-like variant notation' },
                ));
            }
            if (body.upload && typeof body.upload !== 'boolean') {
                return next(new ValidationError(
                    { message: 'request body.upload must be a boolean' },
                ));
            }
            if (body.existsOk && typeof body.existsOk !== 'boolean') {
                return next(new ValidationError(
                    { message: 'request body.existsOk must be a boolean' },
                ));
            }

            const invalidParams = [];

            // Allowed params
            for (const prop of Object.keys(body)) {
                if (![
                    'notation',
                    'upload',
                    'existsOk',
                    'preferedRefSrcName',
                ].includes(prop)) {
                    invalidParams.push(prop);
                }
            }

            if (invalidParams.length) {
                return next(new ValidationError({
                    message: `Invalid parameters: ${invalidParams.join(', ')}`,
                }));
            }

            // Session
            let session;

            try {
                session = await app.pool.acquire();
            } catch (err) {
                return next(err);
            }

            // Content
            let content;

            try {
                const { notation, ...opt } = body;
                content = await getContent(session, notation, opt);
            } catch (err) {
                session.close();
                return next(err);
            }

            // Return content as json; no upload.
            // Useful if properties need to be reviewed or added (e.g. germline, assembly, etc.)
            if (body.upload === false) {
                return res.status(HTTP_STATUS.OK).json(jc.decycle({ result: content }));
            }

            // PV upload (default)
            try {
                const [result, status] = await uploadPositionalVariant(session, req.user, content, {
                    existsOk: body.existsOk,
                });
                session.close();
                return res.status(HTTP_STATUS[status]).json(jc.decycle({ result }));
            } catch (err) {
                session.close();
                logger.log('debug', err);
                return next(err);
            }
        },
    );
};

module.exports = {
    addHgvsUploadRoute,
};
