
const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');

const {error: {AttributeError}, schema: {schema}} = require('@bcgsc/knowledgebase-schema');

const openapi = require('./openapi');
const resource = require('./resource');
const {logger} = require('./../repo/logging');
const {
    MIN_WORD_SIZE, checkStandardOptions
} = require('./query');
const {selectByKeyword, selectFromList, selectCounts} = require('../repo/commands');
const {NoRecordFoundError} = require('../repo/error');


const addKeywordSearchRoute = (opt) => {
    const {
        router, db
    } = opt;
    logger.log('verbose', 'NEW ROUTE [GET] /statements/search');

    app.router.get('/statements/search',
        async (req, res, next) => {
            const {
                keyword
            } = req.query;

            const options = {user: req.user};
            try {
                Object.assign(options, checkStandardOptions(req.query));
            } catch (err) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
            }
            if (keyword === undefined) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    message: 'keyword query parameter is required'
                });
            }
            const wordList = keyword.split(/\s+/);

            if (wordList.some(word => word.length < MIN_WORD_SIZE)) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(new AttributeError(
                    `Word "${keyword}" is too short to query with ~ operator. Must be at least ${
                        MIN_WORD_SIZE
                    } letters after splitting on whitespace characters`
                ));
            }
            try {
                const result = await selectByKeyword(db, wordList, options);
                return res.json(jc.decycle({result}));
            } catch (err) {
                if (err instanceof AttributeError) {
                    logger.log('debug', err);
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                return next(err);
            }
        });
};


const addGetRecordsByList = ({router, db}) => {
    router.get('/records',
        async (req, res) => {
            let options;
            try {
                options = {...checkStandardOptions(req.query), user: req.user};
            } catch (err) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
            }

            const {
                rid = '', activeOnly, neighbors, user, ...rest
            } = options;
            if (Object.keys(rest).length) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    message: `Invalid query parameter(s) (${Object.keys(rest).join(', ')})`,
                    invalidParams: rest
                });
            }

            try {
                const result = await selectFromList(db, rid.split(',').map(r => r.trim()), options);
                return res.json(jc.decycle({result}));
            } catch (err) {
                if (err instanceof AttributeError) {
                    logger.log('debug', err);
                    return res.status(HTTP_STATUS.BAD_REQUEST).json(err);
                }
                if (err instanceof NoRecordFoundError) {
                    logger.log('debug', err);
                    return res.status(HTTP_STATUS.NOT_FOUND).json(err);
                }
                return next(err);
            }
        });
};


const addStatsRoute = ({router, db}) => {
    // add the stats route
    const classList = Object.keys(schema).filter(
        name => !schema[name].isAbstract
            && schema[name].subclasses.length === 0 // terminal classes only
            && !schema[name].embedded
    );
    router.get('/stats', async (req, res) => {
        try {
            const {groupBySource = false, activeOnly = true} = checkStandardOptions(req.query);
            const stats = await selectCounts(db, {groupBySource, activeOnly, classList});
            return res.status(HTTP_STATUS.OK).json(jc.decycle({result: stats}));
        } catch (err) {
            if (err instanceof AttributeError) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json(jc.decycle(err));
            }
            return next(err);
        }
    });
};

module.exports = {
    openapi, resource, addKeywordSearchRoute, addGetRecordsByList, addStatsRoute
};
