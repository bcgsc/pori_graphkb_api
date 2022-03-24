const HTTP_STATUS = require('http-status-codes');
const {
    util: { timeStampNow },
    schema,
    constants: { PERMISSIONS },
} = require('@bcgsc-pori/graphkb-schema');

const { logger } = require('../repo/logging');
const { RecordNotFoundError, PermissionError } = require('../repo/error');
const { checkUserAccessFor } = require('../middleware/auth');

const getCurrentLicense = async (db) => db.query(
    `SELECT * FROM ${schema.models.LicenseAgreement.name} ORDER BY enactedAt DESC LIMIT 1`,
).one();

/**
 * Route to query the db
 *
 * @param {AppServer} app the GraphKB app server
 */
const addEulaRoutes = (app) => {
    app.router.get(
        '/license',
        async (req, res, next) => {
            let session;

            try {
                session = await app.pool.acquire();
            } catch (err) {
                return next(err);
            }

            try {
                const result = await getCurrentLicense(session);
                session.close();
                return res.json(result);
            } catch (err) {
                session.close();
                logger.log('debug', err);
                return next(err);
            }
        },
    );

    app.router.post(
        '/license/sign',
        async (req, res, next) => {
            const { user } = req;
            let session;

            try {
                session = await app.pool.acquire();
            } catch (err) {
                return next(err);
            }

            try {
                const record = await session.record.get(user['@rid']);

                if (!user) {
                    throw new RecordNotFoundError(`No user with the ID ${user['@rid']}`);
                }
                const result = await session.record.update({ ...record, signedLicenseAt: timeStampNow() });
                session.close();
                return res.json(result);
            } catch (err) {
                session.close();
                logger.log('debug', err);
                return next(err);
            }
        },
    );

    app.router.post(
        '/license',
        async (req, res, next) => {
            const { body: content, user } = req;

            // check for the required access
            if (!checkUserAccessFor(user, schema.models.LicenseAgreement.name, PERMISSIONS.CREATE)) {
                return next(new PermissionError('Insufficient permissions to upload a license agreement'));
            }
            let session;

            try {
                session = await app.pool.acquire();
            } catch (err) {
                return next(err);
            }

            try {
                const result = await session.insert().into(schema.models.LicenseAgreement.name).set({
                    content,
                    enactedAt: timeStampNow(),
                }).one();
                session.close();
                return res.status(HTTP_STATUS.CREATED).json(result);
            } catch (err) {
                session.close();
                logger.log('debug', err);
                return next(err);
            }
        },
    );

    // add the route to enforce unsigned users cannot access
    app.router.use(async (req, res, next) => {
        const { user } = req;
        let session;

        try {
            session = await app.pool.acquire();
        } catch (err) {
            return next(err);
        }

        try {
            const license = await getCurrentLicense(session);

            if (!user.signedLicenseAt || license.enactedAt > user.signedLicenseAt) {
                throw new PermissionError('User must sign the license agreement before they can access data. See https://graphkb.bcgsc.ca/about/terms. After you have signed you\'ll need to retrieve a new token');
            }
            session.close();
            return next();
        } catch (err) {
            session.close();
            logger.log('debug', err);
            return next(err);
        }
    });
};

module.exports = { addEulaRoutes };
