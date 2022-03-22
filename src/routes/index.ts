import HTTP_STATUS from 'http-status-codes';
import jc from 'json-cycle';

import gkbSchema from '@bcgsc-pori/graphkb-schema';
const { error: { AttributeError }, schema: { schema }, schema: schemaDefn } = gkbSchema;
import { parseVariant, ParsingError } from '@bcgsc-pori/graphkb-parser';

import * as openapi from './openapi';
import * as resource from './resource';
import { logger } from '../repo/logging';
import { checkStandardOptions } from '../repo/query_builder/util';
import { selectCounts } from '../repo/commands';
import { addErrorRoute } from './error';
import { addQueryRoute } from './query';

const parseClassListQueryParam = (param) => param.split(',').map((cls) => schemaDefn.get(cls).name);

const addStatsRoute = (app) => {
    // add the stats route
    const defaultClassList = Object.keys(schema).filter(
        (name) => !schema[name].isAbstract
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
};

const addParserRoute = (app) => {
    logger.info('NEW ROUTE [POST] /parse');
    app.router.post('/parse', async (req, res, next) => {
        if (!req.body || !req.body.content) {
            return next(new AttributeError('body.content is a required input'));
        }
        const { content, requireFeatures = true, ...rest } = req.body;

        if (Object.keys(rest).length) {
            return next(new AttributeError(`Unexpected attributes: ${Object.keys(rest).join(', ')}`));
        }

        try {
            const parsed = parseVariant(content, requireFeatures);
            return res.status(HTTP_STATUS.OK).json({ result: parsed });
        } catch (err) {
            if (err instanceof ParsingError) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(jc.decycle(err));
            }
            return next(err);
        }
    });
};

export {
    addErrorRoute, addParserRoute, addQueryRoute, addStatsRoute, openapi, resource,
};
