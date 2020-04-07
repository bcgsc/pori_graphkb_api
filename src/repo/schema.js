/**
 * Repsonsible for defining and loading the database schema.
 */
/**
 * @ignore
 */
const _ = require('lodash');

const { RID } = require('orientjs');
const { constants, schema: { schema: SCHEMA_DEFN }, util: { timeStampNow } } = require('@bcgsc/knowledgebase-schema');

constants.RID = RID; // IMPORTANT: Without this all castToRID will do is convert to a string

const { logger } = require('./logging');
const { ClassModel, Property } = require('./model');
const { getLoadVersion } = require('./migrate/version');

/**
 * Split class models into an array or with dependencies
 * will be in an array after the array it depends on
 * @param {Object.<string,ClassModel>} schema mapping of names to class models
 */
const splitSchemaClassLevels = (schema) => {
    const ranks = {};
    const queue = Object.values(schema);

    while (queue.length > 0) {
        const curr = queue.shift();
        let dependencies = Array.from(curr.inherits || []);

        for (const prop of Object.values(curr.properties)) {
            if (prop.linkedClass) {
                dependencies.push(prop.linkedClass.name);
            }
        }
        dependencies = dependencies.filter(name => schema[name] !== undefined);

        if (dependencies.length > 0) {
            if (dependencies.some(name => ranks[name] === undefined)) {
                queue.push(curr);
            } else {
                ranks[curr.name] = Math.max(...Array.from(dependencies, name => ranks[name])) + 1;
            }
        } else {
            ranks[curr.name] = 0;
        }
    }
    const split = [];

    for (const [clsName, rank] of Object.entries(ranks)) {
        if (split[rank] === undefined) {
            split[rank] = [];
        }
        split[rank].push(schema[clsName]);
    }
    return split;
};


/**
 * Uses a table to track the last version of the schema for this db
 *
 * @param {orientjs.Db} db the orientjs database connection object
 */
const createSchemaHistory = async (db) => {
    logger.log('info', 'creating the schema metadata table');
    const tableName = 'SchemaHistory';
    const cls = await db.class.create(tableName, null, null, false);

    await cls.property.create({
        name: 'name',
        type: 'string',
        notNull: true,
        mandatory: true,
    });
    await cls.property.create({
        name: 'version',
        type: 'string',
        notNull: true,
        mandatory: true,
    });
    await cls.property.create({
        name: 'url',
        type: 'string',
        notNull: false,
        mandatory: false,
    });
    await cls.property.create({
        name: 'createdAt',
        type: 'long',
        notNull: true,
        mandatory: true,
    });
    const { version, name, url } = getLoadVersion();

    // now insert the current schema version
    logger.log('info', `Log the current schema version (${version})`);
    await db.insert().into(tableName).set({
        version,
        name,
        url,
        createdAt: timeStampNow(),
    }).one();
    return cls;
};


const generateDefaultGroups = () => {
    // create the default user groups
    const userGroups = {
        admin: {}, readonly: {}, regular: {}, manager: {},
    };

    for (const model of Object.values(SCHEMA_DEFN)) {
        // The permissions for operations against a class should be the intersection of the
        // exposed routes and the group type
        const { name, permissions } = model;

        for (const [groupName, group] of Object.entries(userGroups)) {
            if (permissions[groupName] !== undefined) {
                group[name] = permissions[groupName];
            } else {
                group[name] = permissions.default;
            }
        }
    }
    return Object.entries(userGroups).map(([name, permissions]) => ({ name, permissions }));
};


/**
 * Defines and uilds the schema in the database
 *
 * @param {orientjs.Db} db the orientjs database connection object
 */
const createSchema = async (db) => {
    // create the schema_history model
    await createSchemaHistory(db);
    // create the permissions class
    logger.log('info', 'create the Permissions class');
    await ClassModel.create(SCHEMA_DEFN.Permissions, db); // (name, extends, clusters, abstract)
    // create the user class
    logger.log('info', 'create the UserGroup class');
    await ClassModel.create(SCHEMA_DEFN.UserGroup, db, { properties: false, indices: false });
    logger.log('info', 'create the User class');
    await ClassModel.create(SCHEMA_DEFN.User, db);
    logger.log('info', 'Add properties to the UserGroup class');
    await ClassModel.create(SCHEMA_DEFN.UserGroup, db, { properties: true, indices: true });
    // modify the existing vertex and edge classes to add the minimum required attributes for tracking etc
    const V = await db.class.get('V');
    await Promise.all(Array.from(
        Object.values(SCHEMA_DEFN.V._properties).filter(p => !p.name.startsWith('@')),
        async prop => Property.create(prop, V),
    ));
    const E = await db.class.get('E');
    await Promise.all(Array.from(
        Object.values(SCHEMA_DEFN.E._properties).filter(p => !p.name.startsWith('@')),
        async prop => Property.create(prop, E),
    ));

    await Promise.all(Array.from(['E', 'V', 'User'], cls => db.index.create({
        name: `${cls}.activeId`,
        type: 'unique',
        metadata: { ignoreNullValues: false },
        properties: ['uuid', 'deletedAt'],
        class: cls,
    })));
    logger.log('info', 'defined schema for the major base classes');
    // create the other schema classes
    const classesByLevel = splitSchemaClassLevels(
        _.omit(SCHEMA_DEFN, ['Permissions', 'User', 'UserGroup', 'V', 'E']),
    );

    for (const classList of classesByLevel) {
        logger.log('info', `creating the classes: ${Array.from(classList, cls => cls.name).join(', ')}`);
        await Promise.all(Array.from(classList, async cls => ClassModel.create(cls, db))); // eslint-disable-line no-await-in-loop
    }

    // create the default user groups
    const userGroups = generateDefaultGroups();

    logger.log('info', 'creating the default user groups');
    const defaultGroups = userGroups
        .map(rec => SCHEMA_DEFN.UserGroup.formatRecord(rec, { addDefaults: true }));

    await Promise.all(Array.from(defaultGroups, async x => db.insert().into('UserGroup').set(x).one()));

    logger.log('info', 'Schema is Complete');
};


/**
 * Loads the schema from the database and then adds additional checks. returns the object of models.
 * Checks that the schema loaded from the databases matches the schema defined here
 *
 * @param {orientjs.Db} db the orientjs database connection
 */
const loadSchema = async (db) => {
    // adds checks etc to the schema loaded from the database
    const classes = await db.class.list();

    for (const cls of classes) {
        if (cls.name === 'SchemaHistory') {
            continue;
        }
        if (/^(O[A-Z]|_)/.exec(cls.name)) { // orientdb builtin classes
            continue;
        }
        const model = SCHEMA_DEFN[cls.name];

        if (model === undefined) {
            throw new Error(`The class loaded from the database (${model.name}) is not defined in the SCHEMA_DEFN`);
        }
        ClassModel.compareToDbClass(model, cls); // check that the DB matches the SCHEMA_DEFN

        if (cls.superClass && !model.inherits.includes(cls.superClass)) {
            throw new Error(`The class ${model.name} inherits according to the database (${cls.superClass}) does not match those defined by the schema definition: ${SCHEMA_DEFN[model.name].inherits}`);
        }
    }

    for (const cls of Object.values(SCHEMA_DEFN)) {
        if (cls.isAbstract) {
            continue;
        }
        logger.log('verbose', `loaded class: ${cls.name} [${cls.inherits}]`);
    }
    logger.log('verbose', 'linking models');
    db.schema = SCHEMA_DEFN;
    // set the default record group
    logger.log('info', 'schema loading complete');
    return SCHEMA_DEFN;
};


module.exports = {
    generateDefaultGroups,
    createSchema,
    loadSchema,
    SCHEMA_DEFN,
    splitSchemaClassLevels,
};