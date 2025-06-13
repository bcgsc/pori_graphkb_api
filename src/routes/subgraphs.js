/**
 * ONTOLOGIES SUBGRAPH ROUTE
 * Traverse an ontology and return a subgraph (nodes + edges)
 */

const HTTP_STATUS_CODES = require('http-status-codes');
const jc = require('json-cycle');

const { ValidationError } = require('@bcgsc-pori/graphkb-schema');

const { logger } = require('../repo/logging');
const subgraphFunctions = require('../repo/subgraphs/subgraphtype');
const { getInheritingClasses } = require('../repo/subgraphs/util');

const addSubgraphRoutes = (app) => {
    // route is POST only
    logger.log('verbose', 'NEW ROUTE [POST] /subgraphs/{ontology}');
    app.router.post(
        '/subgraphs/:ontology',
        async (req, res, next) => {
            const { body, params: { ontology } } = req;

            // ontology check
            const ONTOLOGIES = getInheritingClasses('Ontology');

            if (!ONTOLOGIES.includes(ontology)) {
                return next(new ValidationError(
                    { message: `Unrecognized ontology (${ontology}). Expected one of [${ONTOLOGIES.join(', ')}]` },
                ));
            }

            // subgraphType
            let { subgraphType } = body || {};

            if (!subgraphType) {
                // default to 'complete'
                // It's the only subgraph that can be performed without a request body since no base is needed
                subgraphType = 'complete';
            }
            logger.debug(`subgraphType = '${subgraphType}'`);

            // Dynamic resolution of available subgraphType names mapped to their traversal functions
            const SUBGRAPHS = new Map(Object.entries(subgraphFunctions));

            if (!SUBGRAPHS.has(subgraphType)) {
                const s = [...SUBGRAPHS.keys()].join(', ');
                return next(new ValidationError(
                    { message: `Unrecognized subgraphType (${subgraphType}). Expected one of [${s}]` },
                ));
            }

            // new session
            let session;

            try {
                session = await app.pool.acquire();
            } catch (err) {
                return next(err);
            }

            // subgraph query
            try {
                const fn = SUBGRAPHS.get(subgraphType); // subgraph function
                const result = await fn(
                    session,
                    ontology,
                    body,
                );
                session.close();
                return res.status(HTTP_STATUS_CODES.OK).json(jc.decycle({ result }));
            } catch (err) {
                session.close();

                if (err instanceof ValidationError) {
                    return res.status(HTTP_STATUS_CODES.BAD_REQUEST).json(err);
                }
                return next(err);
            }
        },
    );
};

module.exports = { addSubgraphRoutes };
