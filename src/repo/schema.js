/**
 * Repsonsible for defining and loading the database schema.
 */
/**
 * @ignore
 */
const _ = require('lodash');

const { RID } = require('orientjs');
const { constants, schema: { schema: SCHEMA_DEFN }, util: { timeStampNow } } = require('@bcgsc-pori/graphkb-schema');

constants.RID = RID; // IMPORTANT: Without this all castToRID will do is convert to a string

const { logger } = require('./logging');
const { ClassModel, Property } = require('./model');
const { getLoadVersion } = require('./migrate/version');
const { createUser } = require('./commands');

const DEFAULT_LICENSE_CONTENT = [
    { content: 'Canada\'s Michael Smith Genome Sciences Centre retains ownership of all intellectual property rights of any kind related to the Platform and Service, including applicable copyrights, patents, trademarks, and other proprietary rights. Other trademarks, service marks, graphics and logos used in connection with the GraphKB platform and its services may be the trademarks of users and third parties. Canada\'s Michael Smith Genome Sciences Centre does not transfer to users any intellectual property. All rights, titles and interests in and to such property will remain solely with the original owner. Canada\'s Michael Smith Genome Sciences Centre reserve all rights that are not expressly granted under this Term of Use.', id: 'copyright', label: 'Copyright' },
    { content: 'Your access to GraphKB on this platform is provided under, and subject to specific license agreements. Except as specifically permitted, no portion of this web site may be distributed or reproduced by any means, or in any form, without the explicit written permission of Canada\'s Michael Smith Genome Sciences Centre. In particular, you agree not to reproduce, retransmit, distribute, disseminate, sell, publish, broadcast, or circulate the information owned by Canada\'s Michael Smith Genome Sciences Centre, or received from any other party or individual through the GraphKB platform to anyone, including but not limited to others in your organization. To obtain a license for use of GraphKB other than as expressly granted in these terms of use, including for commercial purposes, please contact graphkb@bcgsc.ca', id: 'useof', label: 'Use of GraphKB' },
    { content: 'Canada\'s Michael Smith Genome Sciences Centre and its affiliates do not assert any proprietary rights, or make any recommendations or endorsements about third-party products and services. References to third-party services and products are provided by GraphKB "AS IS", without warranty of any kind, either express or implied. Some GraphKB data may be subject to the copyright of third parties; you should consult these entities for any additional terms of use. \n\nSome GraphKB content may provide links to other Internet sites for the convenience of users. Canada\'s Michael Smith Genome Sciences Centre and its affiliates are not responsible for the availability or content of these external sites, nor does it endorse, warrant, or guarantee the products, services, or information described or offered at these other Internet sites. Users cannot assume that the external sites will abide by the same Privacy Policy to which Canada\'s Michael Smith Genome Sciences Centre and its affiliates adhere. It is the responsibility of the user to examine the copyright and licensing restrictions of linked pages and to secure all necessary permissions.', id: 'thirdparty', label: 'Third-Party Platforms, Products, and Services' },
    { content: 'You acknowledge that your use of the GraphKB platform is at your sole risk and that you assume full responsibility for all risk associated therewith. GraphKB and the GraphKB content are intended to be used only as general education and scientific reference tools. By using GraphKB, you expressly acknowledge and agree that use of GraphKB and the GraphKB content are at your sole risk. The BC Cancer Genome Sciences Centre and its affiliates do not warrant the accuracy of the GraphKB content. You acknowledge that Canada\'s Michael Smith Genome Sciences Centre and its affiliates are not providing medical, diagnostic or any other advice through GraphKB or by providing access to GraphKB content on the platform. The GraphKB content is not intended as a substitute for professional medical advice, diagnosis or treatment.', id: 'disclaimers', label: 'Disclaimers' },
    { content: 'In no event shall Canada\'s Michael Smith Genome Sciences Centre be liable for any damages or other liability to you or any other users of the GraphKB platform. To the maximum extent permitted by law, in no event shall Canada\'s Michael Smith Genome Sciences Centre or any of its affiliates be liable for any special, punitive, indirect, incidental or consequential damages, including but not limited to personal injury, wrongful death, loss of goodwill, loss of use, loss of profits, interruption of service or loss of data, whether in any action in warranty, contract, tort or any other theory of liability (including, but not limited to negligence or fundamental breach), or otherwise arising out of or in any way connected with the use of, reliance on, or the inability to use, the GraphKB platform or any service offered through the GraphKB platform or any material or information contained in, accessed through, or information, products or services obtained through this platform, even if an authorized representative of GraphKB or Canada\'s Michael Smith Genome Sciences Centre is advised of the likelihood or possibility of the same. To the extent any of the above limitations of liability are restricted by applicable federal, state or local law, such limitations shall not apply to the extent of such restrictions.', id: 'limits', label: 'Limitation of Liability' },
    { content: 'Canada\'s Michael Smith Genome Sciences Centre reserves the right, at its sole discretion, to amend these Terms of Use at any time and will update these Terms of Use in the event of any such amendments. Users are expected to periodically check the Terms of Use for any amendments, but Canada\'s Michael Smith Genome Sciences Centre will take reasonable steps to notify users of significant material changes. Users continued use of the platform and/or the services following such changes shall constitute their affirmative acknowledgment of the Terms of Use, the modification, and agreement to abide and be bound by the Terms of Use, as amended.', id: 'terms', label: 'Modification of Terms of Use' },
];

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
        mandatory: true,
        name: 'name',
        notNull: true,
        type: 'string',
    });
    await cls.property.create({
        mandatory: true,
        name: 'version',
        notNull: true,
        type: 'string',
    });
    await cls.property.create({
        mandatory: false,
        name: 'url',
        notNull: false,
        type: 'string',
    });
    await cls.property.create({
        mandatory: true,
        name: 'createdAt',
        notNull: true,
        type: 'long',
    });
    const { version, name, url } = getLoadVersion();

    // now insert the current schema version
    logger.log('info', `Log the current schema version (${version})`);
    await db.insert().into(tableName).set({
        createdAt: timeStampNow(),
        name,
        url,
        version,
    }).one();
    return cls;
};


const generateDefaultGroups = () => {
    // create the default user groups
    const userGroups = {
        admin: {}, manager: {}, readonly: {}, regular: {},
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
    await ClassModel.create(SCHEMA_DEFN.UserGroup, db, { indices: false, properties: false });
    logger.log('info', 'create the User class');
    await ClassModel.create(SCHEMA_DEFN.User, db);
    logger.log('info', 'Add properties to the UserGroup class');
    await ClassModel.create(SCHEMA_DEFN.UserGroup, db, { indices: true, properties: true });
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
        class: cls,
        metadata: { ignoreNullValues: false },
        name: `${cls}.activeId`,
        properties: ['uuid', 'deletedAt'],
        type: 'unique',
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

    logger.info('creating the default user agreement');
    await db.insert().into(SCHEMA_DEFN.LicenseAgreement.name).set({
        content: DEFAULT_LICENSE_CONTENT,
        enactedAt: timeStampNow(),
    }).one();

    // create the default users
    logger.info('create default user: graphkb_importer');
    await createUser(db, { groupNames: ['manager', 'regular'], signedLicenseAt: timeStampNow(), userName: 'graphkb_importer' });

    logger.info('create default user: graphkb_admin');
    await createUser(db, { groupNames: ['admin', 'manager', 'regular'], signedLicenseAt: timeStampNow(), userName: 'graphkb_admin' });

    logger.info('create default user: ipr_graphkb_link');
    await createUser(db, { groupNames: ['readonly'], signedLicenseAt: timeStampNow(), userName: 'ipr_graphkb_link' });

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
    DEFAULT_LICENSE_CONTENT,
    SCHEMA_DEFN,
    createSchema,
    generateDefaultGroups,
    loadSchema,
    splitSchemaClassLevels,
};
