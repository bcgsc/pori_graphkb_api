const {
    error: { AttributeError },
    schema: { schema: SCHEMA_DEFN },
    constants: { PERMISSIONS },
} = require('@bcgsc/knowledgebase-schema');
const { logger } = require('../logging');
const { parseRecord } = require('../query_builder');
const {
    RecordExistsError, PermissionError,
} = require('../error');
const { select, getUserByName, fetchDisplayName } = require('./select');
const { wrapIfTypeError, omitDBAttributes } = require('./util');
const { checkUserAccessFor } = require('../../middleware/auth');

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
        userName, groupNames,
    } = opt;
    const userGroups = await db.select().from('UserGroup').all();
    const groupIds = Array.from(userGroups.filter(
        group => groupNames.includes(group.name),
    ), group => group['@rid']);
    const record = SCHEMA_DEFN.User.formatRecord({
        groups: groupIds,
        name: userName,
        signedLicenseAt: opt.signedLicenseAt || null,
    }, { addDefaults: true, dropExtra: false });
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
    const { content, model, user } = opt;
    content.createdBy = user['@rid'];
    const {
        out: from, in: to, '@class': className, ...record
    } = model.formatRecord(content, { addDefaults: true, dropExtra: false });

    // already checked not null in the format method
    if (from.toString() === to.toString()) {
        throw new AttributeError('an edge cannot be used to relate a node/vertex to itself');
    }

    // check that the user has permissions to update at least one of the from/to vertices
    const [source, target] = await db.record.get([from, to]);

    if (!checkUserAccessFor(user, source['@class'], PERMISSIONS.CREATE)
        && !checkUserAccessFor(user, target['@class'], PERMISSIONS.CREATE)
    ) {
        throw new PermissionError(`user has insufficient permissions to link records of types (${source['@class']}, ${target['@class']})`);
    }

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
        content, model, user,
    } = opt;

    if (model.isEdge) {
        return createEdge(db, opt);
    } if (model.getActiveProperties()) {
        // try select before create if active properties are defined (as they may not be db enforceable)
        try {
            const query = parseRecord(model, content, { activeIndexOnly: true });

            const records = await select(db, query);

            if (records.length) {
                throw new RecordExistsError(`Cannot create the record. Violates the unique constraint (${model.name}.active)`);
            }
        } catch (err) {
            logger.error(err);
            throw wrapIfTypeError(err);
        }
    }
    const newRecordContent = { ...content, createdBy: user['@rid'] };

    if (model.inherits.includes('V')) {
        newRecordContent.updatedBy = user['@rid'];
    }
    const record = model.formatRecord(
        newRecordContent,
        { addDefaults: true, dropExtra: false },
    );

    if (model.name === 'Statement') {
        if (!record.conditions.map(c => c.toString()).includes(record.subject.toString())) {
            record.conditions.push(record.subject);
            // TODO: handle this on the front-end instead of the API
            // throw new AttributeError('Statement subject must also be present in the record conditions');
        }
    }

    try {
        if (!content.displayName && model.properties.displayName) {
            // displayName exists but has not been filled
            record.displayName = await fetchDisplayName(db, model, record);
        } else if (!content.displayNameTemplate && model.properties.displayNameTemplate) {
            // displayName exists but has not been filled
            record.displayNameTemplate = await fetchDisplayName(db, model, record);
        }
        const result = await db.insert().into(model.name).set(omitDBAttributes(record)).one();

        logger.debug(`created ${result['@rid']}`);
        return result;
    } catch (err) {
        throw wrapIfTypeError(err);
    }
};


module.exports = { create, createUser };
