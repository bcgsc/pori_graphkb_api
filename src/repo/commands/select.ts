/**
 * Contains all functions for directly interacting with the database
 */
/**
 * @ignore
 */
import orientjs from 'orientjs';
import gkbSchema from '@bcgsc-pori/graphkb-schema';
const {
    schema: { schema },
    error: { AttributeError },
    sentenceTemplates: { chooseDefaultTemplate },
    util: { castToRID },
} = gkbSchema;
import { stringifyVariant } from '@bcgsc-pori/graphkb-parser';

import { logger } from '../logging';
import { parse } from '../query_builder';

import { MultipleRecordsFoundError,
    NoRecordFoundError } from '../error';
import { trimRecords } from '../util';
import { wrapIfTypeError } from './util';

const RELATED_NODE_DEPTH = 3;
const QUERY_LIMIT = 1000;

const groupableParams = Object.values(schema.V.queryProperties)
    .filter((prop) => prop.linkedClass && (
        Object.keys(prop.linkedClass.queryProperties).includes('displayName')
    ))
    .map((prop) => prop.name);

/**
 * @param {orientjs.Db} db the database connection object
 * @param {Object} opt
 * @param {Array.<string>} opt.classList list of classes to gather stats for. Defaults to all
 * @param {Boolean} [opt.history=true] ignore deleted records
 * @param {Boolean} [opt.groupBy=''] linked property to group the results by (must be a class with the displayName property)
 */
const selectCounts = async (db: orientjs.Db, opt: {groupBy?: string; history?: boolean; classList?: string[]} = {}) => {
    const {
        groupBy = '',
        history = false,
        classList = Object.keys(schema),
    } = opt;

    if (groupBy && !groupableParams.includes(groupBy)) {
        throw new AttributeError(`Invalid groupBy parameter (${groupBy}) must be one of (${groupableParams.join(',')})`);
    }

    const tempCounts = await Promise.all(classList.map(
        async (cls) => {
            let statement;

            if (!groupBy) {
                statement = `SELECT count(*) as cnt FROM ${cls}`;

                if (!history) {
                    statement = `${statement} WHERE deletedAt IS NULL`;
                }
            } else if (!history) {
                statement = `SELECT ${groupBy}.displayName as ${groupBy}, count(*) as cnt FROM ${cls} WHERE deletedAt IS NULL GROUP BY ${groupBy}`;
            } else {
                statement = `SELECT ${groupBy}.displayName as ${groupBy}, count(*) as cnt FROM ${cls} GROUP BY ${groupBy}`;
            }
            logger.log('debug', statement);
            return db.query(statement).all();
        },
    ));
    const counts = {};

    // nest counts into objects based on the grouping keys
    for (let i = 0; i < classList.length; i++) {
        const name = classList[i];
        counts[name] = {};

        for (const record of tempCounts[i]) {
            if (groupBy) {
                counts[name][record[groupBy] || null] = record.cnt;
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
const getUserByName = async (db: orientjs.Db, username) => {
    logger.debug(`getUserByName: ${username}`);
    // raw SQL to avoid having to load db models in the middleware
    let user;

    try {
        user = await db.query(
            'SELECT *, groups:{*, @rid, @class} from User where name = :param0 AND deletedAt IS NULL',
            {
                params: { param0: username },
            },
        ).all();
    } catch (err) {
        throw wrapIfTypeError(err);
    }

    if (user.length > 1) {
        logger.error(`selected multiple users: ${user.map((r) => r['@rid']).join(', ')}`);
        throw new MultipleRecordsFoundError(`username (${username}) is not unique and returned multiple (${user.length}) records`);
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
const select = async (db: orientjs.Db, query, opt = {}) => {
    // set the default options
    const { exactlyN = null, user } = opt;
    logger.log('debug', query.displayString());

    // send the query statement to the database
    const { params, query: statement } = query.toString
        ? query.toString()
        : query;

    const queryOpt = {
        params,
    };
    logger.log('debug', JSON.stringify(queryOpt));

    let recordList;

    try {
        recordList = await db.query(`${statement}`, queryOpt).all();
    } catch (err) {
        logger.log('debug', `Error in executing the query statement (${statement})`);
        logger.log('debug', err);
        const error = wrapIfTypeError({ ...err, sql: statement });
        console.error(error);
        throw error;
    }

    logger.log('debug', `selected ${recordList.length} records`);

    recordList = await trimRecords(recordList, { db, history: query.history, user });

    if (exactlyN !== null) {
        if (recordList.length < exactlyN) {
            throw new NoRecordFoundError({
                message: `query expected ${exactlyN} records but only found ${recordList.length}`,
                sql: query.displayString(),
            });
        } else if (exactlyN !== recordList.length) {
            throw new MultipleRecordsFoundError({
                message: `query returned unexpected number of results. Found ${recordList.length} results but expected ${exactlyN} results`,
                sql: query.displayString(),
            });
        } else {
            return recordList;
        }
    } else {
        return recordList;
    }
};

/**
 * Calculate the display name when it requires a db connection to resolve linked records
 */
const fetchDisplayName = async (db: orientjs.Db, model, content) => {
    if (model.inherits.includes('Variant')) {
        const links = [content.type, content.reference1];

        if (content.reference2) {
            links.push(content.reference2);
        }
        const query = parse({
            returnProperties: ['displayName', 'shortName'],
            target: links,
        });
        const [type, reference1, reference2] = await select(
            db,
            query,
        );

        if (model.name === 'CategoryVariant') {
            if (reference2) {
                return `${reference1.displayName} and ${reference2.displayName} ${type.displayName}`;
            }
            return `${reference1.displayName} ${type.displayName}`;
        } if (model.name === 'PositionalVariant') {
            const obj = {
                ...content,
                multiFeature: Boolean(reference2 && reference2.displayName),
                reference1: reference1.displayName,
                reference2: reference2 && reference2.displayName,
                type: content.hgvsType || type.shortName || type.displayName,
            };
            const notation = stringifyVariant(obj);
            return notation;
        }
    } if (model.name === 'Statement') {
        const links = [...content.conditions, ...content.evidence, content.relevance];

        const records = await select(
            db,
            parse({
                returnProperties: ['displayName', '@class', '@rid', 'name'],
                target: links,
            }),
        );
        const recordsById = {};
        const recId = (x) => castToRID(x).toString();

        for (const record of records) {
            recordsById[record['@rid']] = record;
        }
        const templateContent = {
            ...content,
            conditions: content.conditions.map((rid) => recordsById[recId(rid)]),
            evidence: content.evidence.map((rid) => recordsById[recId(rid)]),
            relevance: recordsById[recId(content.relevance)],
            subject: recordsById[recId(content.subject)],
        };
        return chooseDefaultTemplate(templateContent);
    }
    return content.name;
};

export {
    QUERY_LIMIT,
    RELATED_NODE_DEPTH,
    fetchDisplayName,
    getUserByName,
    groupableParams,
    select,
    selectCounts,
};
