

/**
 * Contains all functions for directly interacting with the database
 */
/**
 * @ignore
 */
const {error: {AttributeError}, util: {castToRID}, schema: {schema}} = require('@bcgsc/knowledgebase-schema');
const {variant: {VariantNotation}} = require('@bcgsc/knowledgebase-parser');

const {logger} = require('../logging');
const {
    Query, keywordSearch, searchByLinkedRecords
} = require('../query');
const {
    MultipleRecordsFoundError,
    NoRecordFoundError
} = require('../error');
const {trimRecords} = require('../util');
const {wrapIfTypeError} = require('./util');


const RELATED_NODE_DEPTH = 3;
const QUERY_LIMIT = 1000;


/**
 * @param {orientjs.Db} db the database connection object
 * @param {Object} opt
 * @param {Array.<string>} opt.classList list of classes to gather stats for. Defaults to all
 * @param {Boolean} [opt.activeOnly=true] ignore deleted records
 * @param {Boolean} [opt.groupBySource=false] group by class and source instead of class only
 */
const selectCounts = async (db, opt = {}) => {
    const {
        groupBySource = false,
        activeOnly = true,
        classList = Object.keys(schema)
    } = opt;

    const tempCounts = await Promise.all(classList.map(
        async (cls) => {
            let statement;
            if (!groupBySource) {
                statement = `SELECT count(*) as cnt FROM ${cls}`;
                if (activeOnly) {
                    statement = `${statement} WHERE deletedAt IS NULL`;
                }
            } else if (activeOnly) {
                statement = `SELECT source, count(*) as cnt FROM ${cls} WHERE deletedAt IS NULL GROUP BY source`;
            } else {
                statement = `SELECT source, count(*) as cnt FROM ${cls} GROUP BY source`;
            }
            logger.log('debug', statement);
            return db.query(statement).all();
        }
    ));
    const counts = {};
    // nest counts into objects based on the grouping keys
    for (let i = 0; i < classList.length; i++) {
        const name = classList[i];
        counts[name] = {};
        for (const record of tempCounts[i]) {
            if (groupBySource) {
                counts[name][record.source || null] = record.cnt;
            } else {
                counts[name] = record.cnt;
            }
        }
    }
    return counts;
};


/**
 * Given a user name return the active record. Groups will be returned in full so that table level
 * permissions can be checked
 *
 * @param {orientjs.Db} db the orientjs database connection object
 * @param {string} username the name of the user to select
 */
const getUserByName = async (db, username) => {
    logger.debug(`getUserByName: ${username}`);
    // raw SQL to avoid having to load db models in the middleware
    let user;
    try {
        user = await db.query(
            'SELECT *, groups:{*, @rid, @class} from User where name = :param0 AND deletedAt IS NULL',
            {
                params: {param0: username}
            }
        ).all();
    } catch (err) {
        throw wrapIfTypeError(err);
    }
    if (user.length > 1) {
        throw new MultipleRecordsFoundError(`username '${username} is not unique and returned multiple records`);
    } else if (user.length === 0) {
        throw new NoRecordFoundError(`no user found for the username '${username}'`);
    } else {
        return user[0];
    }
};


/**
 * Builds the query statement for selecting or matching records from the database
 *
 * @param {orientjs.Db} db Database connection from orientjs
 * @param {Query} query the query object
 *
 * @param {Object} opt Selection options
 * @param {?number} [opt.exactlyN=null] if not null, check that the returned record list is the same length as this value
 * @param {User} [opt.user] the current user
 * @param {string} [opt.fetchPlan] overrides the default fetch plan created from the neighbors
 *
 * @todo Add support for permissions base-d fetch plans
 *
 * @returns {Array.<Object>} array of database records
 */
const select = async (db, query, opt = {}) => {
    // set the default options
    const {exactlyN = null, user} = opt;
    logger.log('debug', query.displayString());

    // send the query statement to the database
    const {params, query: statement} = query.toString();
    const queryOpt = {
        params
    };
    logger.log('debug', JSON.stringify(queryOpt));

    let recordList;

    try {
        recordList = await db.query(`${statement}`, queryOpt).all();
    } catch (err) {
        logger.log('debug', `Error in executing the query statement (${statement})`);
        logger.log('debug', err);
        console.error(err);
        throw wrapIfTypeError({...err, sql: statement});
    }

    logger.log('debug', `selected ${recordList.length} records`);

    recordList = await trimRecords(recordList, {activeOnly: query.activeOnly, user, db});

    if (exactlyN !== null) {
        if (recordList.length < exactlyN) {
            throw new NoRecordFoundError({
                message: `query expected ${exactlyN} records but only found ${recordList.length}`,
                sql: query.displayString()
            });
        } else if (exactlyN !== recordList.length) {
            throw new MultipleRecordsFoundError({
                message: `query returned unexpected number of results. Found ${recordList.length} results but expected ${exactlyN} results`,
                sql: query.displayString()
            });
        } else {
            return recordList;
        }
    } else {
        return recordList;
    }
};


/**
 * @param {orientjs.Db} db Database connection from orientjs
 * @param {Array.<string>} keywords array of keywords to search for
 * @param {Object} opt Selection options
 */
const selectByKeyword = async (db, keywords, opt = {}) => {
    const queryObj = Object.assign({
        toString: () => keywordSearch(keywords, {...opt})
    }, opt);
    queryObj.displayString = () => Query.displayString(queryObj);
    return select(db, queryObj);
};


/**
 * @param {orientjs.Db} db Database connection from orientjs
 * @param {Object} opt Selection options
 * @param {ClassModel} opt.model
 * @param {Object} opt.search filters
 */
const searchSelect = async (db, opt = {}) => {
    const queryObj = {
        ...opt,
        toString: () => searchByLinkedRecords(opt)
    };
    queryObj.displayString = () => Query.displayString(queryObj);
    return select(db, queryObj);
};


/**
 * @param {orientjs.Db} db Database connection from orientjs
 * @param {Array.<string|RID>} recordList array of record IDs to select from
 * @param {Object} opt Selection options
 * @param {?Number} opt.neighbors number of related records to fetch
 * @param {?Boolean} opt.activeOnly exclude deleted records
 * @param {?string} opt.projection project to use from select
 */
const selectFromList = async (db, inputRecordList, opt = {}) => {
    const {neighbors = 0, activeOnly = true, projection = '*'} = opt;
    const params = {};
    const recordList = inputRecordList.map(castToRID);
    recordList.forEach((rid) => {
        params[`param${Object.keys(params).length}`] = rid;
    });
    if (recordList.length < 1) {
        throw new AttributeError('Must select a minimum of 1 record');
    }
    // TODO: Move back to using substitution params pending: https://github.com/orientechnologies/orientjs/issues/376
    let query = `SELECT ${projection} FROM [${recordList.map(p => `${p}`).join(', ')}]`;

    if (activeOnly) {
        query = `${query} WHERE deletedAt IS NULL`;
    }
    const queryObj = Object.assign({
        toString: () => ({query, params}),
        activeOnly,
        neighbors,
        params
    }, opt);
    queryObj.displayString = () => Query.displayString(queryObj);
    return select(db, queryObj, {exactlyN: recordList.length});
};


/**
 * Calculate the display name when it requires a db connection to resolve linked records
 */
const fetchDisplayName = async (db, model, content) => {
    if (model.inherits.includes('Variant')) {
        const links = [content.type, content.reference1];
        if (content.reference2) {
            links.push(content.reference2);
        }
        const [type, reference1, reference2] = (await selectFromList(
            db,
            links,
            {projection: 'displayName'}
        )).map(rec => rec.displayName);

        if (model.name === 'CategoryVariant') {
            if (reference2) {
                return `${reference1} and ${reference2} ${type}`;
            }
            return `${reference1} ${type}`;
        } if (model.name === 'PositionalVariant') {
            const obj = {
                ...content, multiFeature: Boolean(reference2), reference1, reference2, type
            };
            const notation = VariantNotation.toString(obj);
            return notation;
        }
    } if (model.name === 'Statement') {
        return null;
    }
    return content.name;
};


module.exports = {
    getUserByName,
    QUERY_LIMIT,
    RELATED_NODE_DEPTH,
    select,
    selectCounts,
    selectByKeyword,
    selectFromList,
    searchSelect,
    fetchDisplayName
};
