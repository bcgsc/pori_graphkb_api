const {
    ValidationError,
    schema,
    PERMISSIONS,
} = require('@bcgsc-pori/graphkb-schema');
const { logger } = require('../logging');
const { parseRecord } = require('../query_builder');
const {
    RecordConflictError, PermissionError,
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
const createUser = async (db, { userName, groupNames, signedLicenseAt }) => {
    const userGroups = await db.select().from('UserGroup').all();
    const groupIds = Array.from(userGroups.filter(
        (group) => groupNames.includes(group.name),
    ), (group) => group['@rid']);
    const record = schema.formatRecord('User', {
        groups: groupIds,
        name: userName,
        signedLicenseAt: signedLicenseAt || null,
    }, { addDefaults: true, dropExtra: false });
    await db.insert().into(schema.models.User.name)
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
 * @param {modelName} modelName the model for the table/class to insert the new record into
 * @param {object} content the edge to be created
 * @param {Object} user the user creating the new record
 */
const createEdge = async (db, { modelName, content: contentIn, user }) => {
    const content = { ...contentIn, createdBy: user['@rid'] };
    const model = schema.get(modelName);
    const {
        out: from, in: to, '@class': className, ...record
    } = schema.formatRecord(modelName, content, { addDefaults: true, dropExtra: false });

    // already checked not null in the format method
    if (from.toString() === to.toString()) {
        throw new ValidationError('an edge cannot be used to relate a node/vertex to itself');
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
 * @param {string} modelName the model for the table/class to insert the new record into
 * @param {Object} content the contents of the new record
 * @param {Object} user the user creating the new record
 */
const create = async (db, { modelName, content, user }) => {
    const model = schema.get(modelName);

    if (model.isEdge) {
        return createEdge(db, { content, modelName, user });
    }
    const newRecordContent = { ...content, createdBy: user['@rid'] };

    if (schema.ancestors(model.name).includes('V')) {
        newRecordContent.updatedBy = user['@rid'];
    }
    const record = schema.formatRecord(
        model.name,
        newRecordContent,
        { addDefaults: true, dropExtra: false },
    );

    if (model.name === 'Statement') {
        if (!record.conditions.map((c) => c.toString()).includes(record.subject.toString())) {
            record.conditions.push(record.subject);
            // TODO: handle this on the front-end instead of the API
            // throw new ValidationError('Statement subject must also be present in the record conditions');
        }
    }

    if (schema.activeProperties(model.name)) {
        // try select before create if active properties are defined (as they may not be db enforceable)
        try {
            const query = parseRecord(model.name, record, { activeIndexOnly: true });

            const records = await select(db, query);

            if (records.length) {
                throw new RecordConflictError(`Cannot create the record. Violates the unique constraint (${model.name}.active)`);
            }
        } catch (err) {
            logger.error(err);
            throw wrapIfTypeError(err);
        }
    }

    try {
        const modelProperties = schema.getProperties(model.name);

        if (!content.displayName && modelProperties.displayName) {
            // displayName exists but has not been filled
            record.displayName = await fetchDisplayName(db, model.name, record);
        } else if (!content.displayNameTemplate && modelProperties.displayNameTemplate) {
            // displayName exists but has not been filled
            record.displayNameTemplate = await fetchDisplayName(db, model.name, record);
        }
        const result = await db.insert().into(model.name).set(omitDBAttributes(record)).one();

        logger.debug(`created ${result['@rid']}`);
        return result;
    } catch (err) {
        throw wrapIfTypeError(err);
    }
};

module.exports = { create, createUser };
