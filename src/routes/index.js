
const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');

const { error: { AttributeError }, schema: { schema } } = require('@bcgsc/knowledgebase-schema');
const { variant: { parse: variantParser }, error: { ParsingError } } = require('@bcgsc/knowledgebase-parser');

const openapi = require('./openapi');
const resource = require('./resource');
const { logger } = require('./../repo/logging');
const {
    checkStandardOptions,
} = require('../repo/query_builder/util');
const { selectCounts } = require('../repo/commands');
const { addErrorRoute } = require('./error');
const { addQueryRoute } = require('./query');


const addStatsRoute = (app) => {
    // add the stats route
    const classList = Object.keys(schema).filter(
        name => !schema[name].isAbstract
            && schema[name].subclasses.length === 0 // terminal classes only
            && !schema[name].embedded,
    );
    app.router.get('/stats', async (req, res, next) => {
        let session;

        try {
            session = await app.pool.acquire();
        } catch (err) {
            return next(err);
        }

        try {
            const { groupBySource = false, history = false } = checkStandardOptions(req.query);
            const stats = await selectCounts(session, { groupBySource, history, classList });
            session.close();
            return res.status(HTTP_STATUS.OK).json(jc.decycle({ result: stats }));
        } catch (err) {
            session.close();
            return next(err);
        }
    });
};


const addParserRoute = (app) => {
    logger.info('NEW ROUTE [POST] /parse');
    app.router.post('/parse', async (req, res, next) => {
        if (!req.body || !req.body.content) {
            return next(new AttributeError('body.content is a required input'));
        }
        const { content, requireFeatures = true } = req.body;

        try {
            const parsed = variantParser(content, requireFeatures);
            return res.status(HTTP_STATUS.OK).json({ result: parsed });
        } catch (err) {
            if (err instanceof ParsingError) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(jc.decycle(err));
            }
            return next(err);
        }
    });
};


module.exports = {
    openapi, resource, addStatsRoute, addParserRoute, addErrorRoute, addQueryRoute,
};
