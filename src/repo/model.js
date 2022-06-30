/**
 * Classes for enforcing constraints on DB classes and properties
 */
/**
 * @ignore
 */
const orientjs = require('orientjs');
const { schema } = require('@bcgsc-pori/graphkb-schema');

const { logger } = require('./logging');

const checkDbCanCreateIndex = (modelName, index) => {
    const properties = schema.getProperties(modelName);

    if (index.type.toLowerCase() !== 'unique') {
        return true;
    }

    for (const propName of index.properties) {
        const propModel = properties[propName];

        if (propModel && propModel.iterable) {
            logger.log('warn', `Cannot create index (${index.name}) on iterable property (${propModel.name})`);
            return false;
        }
    }
    return true;
};

/**
 * Create the property in the database
 *
 * @param {PropertyDefinition} propertyModel
 * @param {orientjs.dbClass} dbClass the database class object from orientjs
 */
const createPropertyInDb = (propertyModel, dbClass) => {
    const dbProperties = {
        mandatory: propertyModel.mandatory,
        name: propertyModel.name,
        notNull: !propertyModel.nullable,
        type: propertyModel.type,
    };

    if (propertyModel.linkedClass) {
        dbProperties.linkedClass = propertyModel.linkedClass;
    }
    if (propertyModel.default !== undefined) {
        // TODO: PENDING https://github.com/orientechnologies/orientjs/issues/379
        if (propertyModel.type !== 'string' || !/\s+/.exec(propertyModel.default)) {
            dbProperties.default = propertyModel.default;
        }
    }
    /** TODO: PENDING https://github.com/orientechnologies/orientjs/issues/377
    if (model.min !== undefined) {
        dbProperties.min = model.min;
    }
    if (model.max !== undefined) {
        dbProperties.max = model.max;
    } */

    return dbClass.property.create(dbProperties);
};

/**
 * Create this class (and its properties) in the database
 *
 * @param {string} modelName the model to create
 * @param {orientjs.Db} db the database connection
 * @param {object} opt optional parameters
 * @param {bool} opt.properties flag which if false properties are not created
 * @param {bool} opt.indices flag which if false indices are not created
 */
const createModelInDb = async (modelName, db, opt = {}) => {
    const {
        properties = true,
        indices = true,
        graceful = false,
    } = opt;
    const model = schema.get(modelName);
    const inherits = model.inherits.length
        ? Array.from(model.inherits).join(',')
        : null;
    let cls;

    try {
        cls = await db.class.get(model.name);
    } catch (err) {
        cls = await db.class.create(model.name, inherits, null, model.isAbstract); // create the class first
    }

    if (properties) {
        await Promise.all(Array.from(
            Object.values(model.properties).filter((prop) => !prop.name.startsWith('@') && !schema.inheritsProperty(model.name, prop.name)),
            async (prop) => createPropertyInDb(prop, cls),
        ));
    }
    if (indices) {
        const createIndex = async (index) => {
            let exists = false;

            if (graceful) {
                try {
                    const curr = await db.index.get(index.name, true); // force refresh of cache

                    if (curr) {
                        exists = true;
                    }
                } catch (err) {}

                if (exists) {
                    logger.info(`index exists ${index.name}`);
                    return;
                }
            }
            if (!index.engine && index.type === 'FULLTEXT') {
                // TODO: https://www.bcgsc.ca/jira/browse/SYS-58339 pending db update to 3.1
                // index.engine = 'LUCENE';
            }
            logger.info(`creating index ${index.name} type ${index.type}`);
            await db.index.create(index);
        };
        await Promise.all(
            model.indices
                .filter((i) => checkDbCanCreateIndex(model.name, i))
                .map(createIndex),
        );
    }
    return cls;
};

/**
 * Given some orientjs class object, compare the model to the schema definition expected
 * @param {orientjs.dbClass} dbClass the class from the database load
 *
 * @throws {Error} when the parsed class from the database does not match the expected schema definition
 */
const compareToDbClass = (dbClass) => {
    const model = schema.get(dbClass.name);

    for (const dbProp of dbClass.properties) {
        if (dbProp.name.startsWith('@') && !['@version', '@class', '@rid'].includes(dbProp.name)) {
            continue;
        }
        // get the property definition from the schema
        const prop = schema.getProperty(dbClass.name, dbProp.name);

        if (prop === undefined) {
            throw new Error(`[${
                model.name
            }] failed to find the property ${
                dbProp.name
            } on the schema definition`);
        }
        const dbPropType = orientjs.types[dbProp.type].toLowerCase();

        if (dbPropType !== prop.type) {
            throw new Error(
                `[${model.name}] The type defined on the schema model (${
                    prop.type
                }) does not match the type loaded from the database (${
                    dbPropType
                })`,
            );
        }
    }

    if ((dbClass.defaultClusterId === -1) !== model.isAbstract && model.name !== 'V' && model.name !== 'E') {
        throw new Error(
            `The abstractness (${
                model.isAbstract
            }) of the schema model ${
                model.name
            } does not match the database definition (${
                dbClass.defaultClusterId
            })`,
        );
    }
};

module.exports = {
    checkDbCanCreateIndex,
    compareToDbClass,
    createModelInDb,
    createPropertyInDb,
};
