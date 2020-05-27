const express = require('express');

const { util: { timeStampNow }, schema: { schema: SCHEMA_DEFN } } = require('@bcgsc/knowledgebase-schema');
const { logger } = require('./../repo/logging');

const { RecordNotFoundError, PermissionError } = require('./../repo/error');


const router = express.Router({ mergeParams: true });


const getCurrentLicense = async db => db.query(
    `SELECT * FROM ${SCHEMA_DEFN.LicenseAgreement.name} ORDER BY enactedAt DESC LIMIT 1`,
).one();

/**
 * Route to query the db
 *
 * @param {AppServer} app the GraphKB app server
 */
router.get('/license', async (req, res, next) => {
    const { dbPool } = req;
    let session;

    try {
        session = await dbPool.acquire();
    } catch (err) {
        return next(err);
    }

    try {
        const result = await getCurrentLicense(session);
        return res.json(result);
    } catch (err) {
        session.close();
        logger.log('debug', err);
        return next(err);
    }
});

router.post('/license', async (req, res, next) => {
    const { body: content, dbPool } = req;
    let session;

    try {
        session = await dbPool.acquire();
    } catch (err) {
        return next(err);
    }

    try {
        const result = await session.insert().into(SCHEMA_DEFN.LicenseAgreement.name).set({
            content,
            enactedAt: timeStampNow(),
        }).one();
        session.close();
        return res.json(result);
    } catch (err) {
        session.close();
        logger.log('debug', err);
        return next(err);
    }
});

router.post('/license/sign', async (req, res, next) => {
    const { user, dbPool } = req;
    let session;

    try {
        session = await dbPool.acquire();
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
});

// add the route to enforce unsigned users cannot access
router.use(async (req, res, next) => {
    const { user, dbPool } = req;
    let session;

    try {
        session = await dbPool.acquire();
    } catch (err) {
        return next(err);
    }

    try {
        const license = await getCurrentLicense(session);

        if (!user.signedLicenseAt || license.enactedAt > user.signedLicenseAt) {
            throw new PermissionError('User must sign the license agreement before they can access data. See https://graphkb.bcgsc.ca/about/terms');
        }
        session.close();
        return next();
    } catch (err) {
        session.close();
        logger.log('debug', err);
        return next(err);
    }
});


module.exports = router;
