
const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');
const express = require('express');

const { schema: { schema }, schema: schemaDefn } = require('@bcgsc/knowledgebase-schema');

const {
    checkStandardOptions,
} = require('../repo/query_builder/util');
const { selectCounts } = require('../repo/commands');


const router = express.Router({ mergeParams: true });

const parseClassListQueryParam = param => param.split(',').map(cls => schemaDefn.get(cls).name);
// add the stats route
const defaultClassList = Object.keys(schema).filter(
    name => !schema[name].isAbstract
        && schema[name].subclasses.length === 0 // terminal classes only
        && !schema[name].embedded,
);

router.get('/', async (req, res, next) => {
    let session;
    const { dbPool } = req;

    try {
        session = await dbPool.acquire();
    } catch (err) {
        return next(err);
    }

    try {
        const { groupBy = '', history = false } = checkStandardOptions(req.query);

        const classList = req.query.classList
            ? parseClassListQueryParam(req.query.classList)
            : defaultClassList;
        const stats = await selectCounts(session, { classList, groupBy, history });
        session.close();
        return res.status(HTTP_STATUS.OK).json(jc.decycle({ result: stats }));
    } catch (err) {
        session.close();
        return next(err);
    }
});


module.exports = router;
