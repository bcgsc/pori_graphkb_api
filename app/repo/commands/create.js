const {error: {AttributeError}, schema: {schema: SCHEMA_DEFN}} = require('@bcgsc/knowledgebase-schema');

const {logger} = require('../logging');
const {parseRecord} = require('../query_builder');
const {
    RecordExistsError
} = require('../error');
const {select, getUserByName, fetchDisplayName} = require('./select');
const {wrapIfTypeError, omitDBAttributes} = require('./util');

/**
 * Create new User record
 *
 * @param {orientjs.Db} db the orientjs database connection
 * @param {Object} opt options
 * @param {string} opt.userName the name of the new user
 * @param {Array.<string>} opt.groupNames the list of group names for which to add the new user to
 */
const createUser = async (db, opt) => {
    const {
        userName, groupNames
    } = opt;
    const userGroups = await db.select().from('UserGroup').all();
    const groupIds = Array.from(userGroups.filter(
        group => groupNames.includes(group.name)
    ), group => group['@rid']);
    const record = SCHEMA_DEFN.User.formatRecord({
        name: userName,
        groups: groupIds
    }, {dropExtra: false, addDefaults: true});
    await db.insert().into(SCHEMA_DEFN.User.name)
        .set(record)
        .one();
    try {
        return await getUserByName(db, userName);
    } catch (err) {
        logger.log('debug', err);
        throw wrapIfTypeError(err);
    }
};

/**
 * create new edge record in the database
 *
 * @param {orientjs.Db} db the orientjs database connection
 * @param {Object} opt options
 * @param {Object} opt.content the contents of the new record
 * @param {string} opt.content.out the @rid of the source node
 * @param {string} opt.content.in the @rid of the target node
 * @param {ClassModel} opt.model the model for the table/class to insert the new record into
 * @param {Object} opt.user the user creating the new record
 */
const createEdge = async (db, opt) => {
    const {content, model, user} = opt;
    content.createdBy = user['@rid'];
    const record = model.formatRecord(content, {dropExtra: false, addDefaults: true});
    const from = record.out;
    const to = record.in;
    // already checked not null in the format method
    if (from.toString() === to.toString()) {
        throw new AttributeError('an edge cannot be used to relate a node/vertex to itself');
    }
    delete record.out;
    delete record.in;
    delete record['@class']; // Ignore if given since determined by the model
    try {
        return await db.create('EDGE', model.name).from(from).to(to).set(record)
            .one();
    } catch (err) {
        throw wrapIfTypeError(err);
    }
};


/**
 * create new record in the database
 *
 * @param {orientjs.Db} db the orientjs database connection
 * @param {Object} opt options
 * @param {Object} opt.content the contents of the new record
 * @param {ClassModel} opt.model the model for the table/class to insert the new record into
 * @param {Object} opt.user the user creating the new record
 * @param {Object.<string,ClassModel>} [schema] only required for creating statements
 */
const create = async (db, opt) => {
    const {
        content, model, user
    } = opt;
    if (model.isEdge) {
        return createEdge(db, opt);
    } if (model.getActiveProperties()) {
        // try select before create if active properties are defined (as they may not be db enforceable)
        try {
            const query = parseRecord(model, content, {activeIndexOnly: true});

            const records = await select(db, query);
            if (records.length) {
                throw new RecordExistsError(`Cannot create the record. Violates the unique constraint (${model.name}.active)`);
            }
        } catch (err) {
            logger.error(err);
            throw wrapIfTypeError(err);
        }
    }
    const record = model.formatRecord(
        {...content, createdBy: user['@rid']},
        {dropExtra: false, addDefaults: true},
    );
    try {
        if (!record.displayName && model.properties.displayName) {
            // displayName exists but has not been filled
            record.displayName = await fetchDisplayName(db, model, record);
        }
        const result = await db.insert().into(model.name).set(omitDBAttributes(record)).one();

        logger.debug(`created ${result['@rid']}`);
        return result;
    } catch (err) {
        throw wrapIfTypeError(err);
    }
};


module.exports = {create, createUser};
