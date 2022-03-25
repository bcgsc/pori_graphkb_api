/**
 * Extensions fetch data from external APIS and return it in a GraphKB compatible format
 */
import HTTP_STATUS_CODES from 'http-status-codes';

import * as gkbSchema from '@bcgsc-pori/graphkb-schema';
const { error: { AttributeError: ValidationError } } = gkbSchema;

import { fetchRecord } from './entrez';
import { fetchRecord as fetchClinicalTrial } from './clinicaltrialsgov';
import { logger } from '../repo/logging';

const addExtensionRoutes = (app) => {
    logger.log('verbose', 'NEW Extension [GET] /extensions/{db}/{id}');
    app.router.get('/extensions/:db(pubmed|gene)/:id', async (req, res, next) => {
        const { db, id } = req.params;

        if (db === 'pubmed' && !/^\d+$/.exec(id)) {
            return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json(new ValidationError('pubmed id must be an integer'));
        }

        try {
            const result = await fetchRecord(db, id);
            return res.status(HTTP_STATUS_CODES.OK).json({ result });
        } catch (err) {
            if (err instanceof ValidationError) {
                return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json(err);
            }
            return next(err);
        }
    });

    app.router.get('/extensions/clinicaltrialsgov/:id', async (req, res, next) => {
        const { id } = req.params;

        try {
            const result = await fetchClinicalTrial(id);
            return res.status(HTTP_STATUS_CODES.OK).json({ result });
        } catch (err) {
            if (err instanceof ValidationError) {
                return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json(err);
            }
            return next(err);
        }
    });
};

export { addExtensionRoutes };
