/**
 * This module will contain migrations that are determined by the content of the SchemaHistory table
 */

const { RID } = require('orientjs');
const semver = require('semver');

const { constants, schema: { schema: SCHEMA_DEFN }, util: { timeStampNow } } = require('@bcgsc/knowledgebase-schema');

constants.RID = RID; // IMPORTANT: Without this all castToRID will do is convert to a string
const { PERMISSIONS } = constants;

const { logger } = require('./../logging');
const { Property, ClassModel } = require('../model');

const _version = require('./version');

/**
 * Checks if the current version is more than a patch change
 *
 * @param {string} currentVersion the version last installed in the db instance (schema history table)
 * @param {string} targetVersion the version of the currently installed node package (node_modules)
 *
 * @returns {boolean} true when more than a patch level change between the versions
 */
const requiresMigration = (currentVersion, targetVersion) => {
    const compatibleVersion = `~${targetVersion.replace(/\.[^.]+$/, '')}`;
    return !semver.satisfies(currentVersion, compatibleVersion);
};

/**
 * Migrate any 1.6.X database to any 1.7.X database
 *
 * @param {orientjs.Db} db the database connection
 */
const migrate16Xto17X = async (db) => {
    logger.info('Indexing Variant.type');
    await db.index.create(
        SCHEMA_DEFN.Variant.indices.find(item => item.name === 'Variant.type'),
    );
    logger.info('Indexing Statement.relevance');
    await db.index.create(
        SCHEMA_DEFN.Statement.indices.find(item => item.name === 'Statement.relevance'),
    );
    logger.info('Indexing Statement.appliesTo');
    await db.index.create(
        SCHEMA_DEFN.Statement.indices.find(item => item.name === 'Statement.appliesTo'),
    );
};


/**
 * Migrate any 1.7.X database to any 1.8.X database
 *
 * @param {orientjs.Db} db the database connection
 */
const migrate17Xto18X = async (db) => {
    logger.info('Add evidence level to Statement');
    const { evidenceLevel } = SCHEMA_DEFN.Statement.properties;
    const dbClass = await db.class.get(SCHEMA_DEFN.Statement.name);
    await Property.create(evidenceLevel, dbClass);
};


const addClassToPermissionsSchema = async (db, model) => {
    await db.command(`CREATE PROPERTY Permissions.${model.name} INTEGER (NOTNULL TRUE, MIN 0, MAX 15)`).all();
    logger.info(`Update the existing usergroup permission schemes: add Permissions.${model.name}`);
    let regularPermission = PERMISSIONS.ALL;

    if (model.isAbstract) {
        regularPermission = PERMISSIONS.READ;
    } else if (model.isEdge) {
        regularPermission = PERMISSIONS.READ | PERMISSIONS.CREATE | PERMISSIONS.DELETE;
    }
    // default to no permissions
    await db.command(`UPDATE UserGroup SET permissions.${model.name} = ${Number(PERMISSIONS.NONE)}`).all();
    await db.command(`UPDATE UserGroup SET permissions.${model.name} = ${Number(regularPermission)} where name = 'admin' or name = 'regular'`).all();
    await db.command(`UPDATE UserGroup SET permissions.${model.name} = ${Number(PERMISSIONS.READ)} where name = 'readonly'`).all();
};


/**
 * Migrate any 1.8.X database to any 1.9.X database
 *
 * @param {orientjs.Db} db the database connection
 */
const migrate18Xto19X = async (db) => {
    logger.info('Convert Evidence to an abstract class (slow, please wait)');
    await db.command('ALTER CLASS Evidence SUPERCLASS -Ontology').all();
    await db.command('DROP CLASS EvidenceGroup').all();
    await db.command('DROP PROPERTY Permissions.EvidenceGroup').all();
    logger.info('Update the existing usergroup permission schemes: remove Permissions.EvidenceGroup');
    await db.command('UPDATE UserGroup REMOVE permissions.EvidenceGroup').all();


    for (const subclass of ['EvidenceLevel', 'ClinicalTrial', 'Publication']) {
        logger.info(`Remove Evidence as parent from ${subclass}`);
        await db.command(`ALTER CLASS ${subclass} SUPERCLASS -Evidence`).all();
        logger.info(`Add Ontology as parent to ${subclass}`);
        await db.command(`ALTER CLASS ${subclass} SUPERCLASS +Ontology`).all();
    }
    logger.info('make evidence abstract');
    await db.command('ALTER CLASS Evidence ABSTRACT TRUE').all();
    await db.command('UPDATE UserGroup set permissions.Evidence = 4 where permissions.Evidence > 4').all();

    logger.info('Re-add Evidence as abstract parent');

    for (const subclass of ['EvidenceLevel', 'ClinicalTrial', 'Publication', 'Source']) {
        logger.info(`Add Evidence as parent of ${subclass} (slow, please wait)`);
        await db.command(`ALTER CLASS ${subclass} SUPERCLASS +Evidence`).all();
    }


    logger.info('Add actionType property to class TargetOf');
    const { actionType } = SCHEMA_DEFN.TargetOf.properties;
    const targetof = await db.class.get(SCHEMA_DEFN.TargetOf.name);
    await Property.create(actionType, targetof);

    logger.info('Create the CuratedContent class');
    await ClassModel.create(SCHEMA_DEFN.CuratedContent, db);
    await addClassToPermissionsSchema(db, SCHEMA_DEFN.CuratedContent);

    logger.info('Add addition Source properties');
    const source = await db.class.get(SCHEMA_DEFN.Source.name);
    const { license, licenseType, citation } = SCHEMA_DEFN.Source.properties;
    await Promise.all([license, licenseType, citation].map(prop => Property.create(prop, source)));
};

/**
 * Migrate from 2.0.X to 2.1.0
 */
const migrate2from0xto1x = async (db) => {
    logger.info('set Biomarker as a superclass of Vocabulary');
    await db.command('ALTER CLASS Vocabulary SUPERCLASS +Biomarker').all();

    logger.info('rename reviewStatus to status on the StatementReview class');
    await db.command('ALTER PROPERTY StatementReview.reviewStatus NAME "status"').all();

    logger.info('set Biomarker as a superclass of Vocabulary');
    await db.command('ALTER PROPERTY Statement.appliesTo LINKEDCLASS Biomarker').all();

    logger.info('create ClinicalTrial.startDate and ClinicalTrial.completionDate');
    const { startDate, completionDate } = SCHEMA_DEFN.ClinicalTrial.properties;
    const trial = await db.class.get(SCHEMA_DEFN.ClinicalTrial.name);
    await Property.create(startDate, trial);
    await Property.create(completionDate, trial);

    logger.info('transform year properties to strings');
    await db.command('UPDATE ClinicalTrial SET startDate = startYear.toString(), completionDate = completionYear.toString()');

    logger.info('Remove the old year properties');
    await db.command('DROP Property ClinicalTrial.startYear').all();
    await db.command('DROP Property ClinicalTrial.completionYear').all();
};


const migrate2from1xto2x = async (db) => {
    for (const name of ['Therapy', 'Feature', 'AnatomicalEntity', 'Disease', 'Pathway', 'Signature', 'Vocabulary', 'CatalogueVariant']) {
        logger.info(`removing Biomarker from superclasses of ${name}`);
        await db.command(`ALTER CLASS ${name} SUPERCLASS -Biomarker`).all();
    }
    logger.info('Set Biomarker as parent class of Ontology');
    await db.command('ALTER CLASS Ontology SUPERCLASS +Biomarker').all();

    logger.info('Create the new RnaPostion class');
    await ClassModel.create(SCHEMA_DEFN.RnaPosition, db);
};


const migrate2from2xto3x = async () => {
    // add timestamp index tp vertex class (typo prevents edge index)
    // no changes due to errors in schema package
    logger.info('No actions to complete');
};

const migrate2from3xto4x = async (db) => {
    logger.info('Adding properties {content, doi} to Publication class');
    const { content, doi } = SCHEMA_DEFN.Publication.properties;
    const publication = await db.class.get(SCHEMA_DEFN.Publication.name);
    await Property.create(content, publication);
    await Property.create(doi, publication);

    logger.info('Creating the Abstract class');
    await ClassModel.create(SCHEMA_DEFN.Abstract, db);
    logger.info('Add Abstract to the Permissions class');
    await addClassToPermissionsSchema(db, SCHEMA_DEFN.Abstract);
};


const migrate2from4xto5x = async (db) => {
    logger.info('Indexing V.createdAt');
    await db.index.create(
        SCHEMA_DEFN.V.indices.find(item => item.name === 'V.createdAt'),
    );
    logger.info('Indexing E.createdAt');
    await db.index.create(
        SCHEMA_DEFN.E.indices.find(item => item.name === 'E.createdAt'),
    );
};

const migrate2from5xto6x = async (db) => {
    logger.info('Adding properties {authors,citation,issue,volume,pages} to Publication class');
    const {
        authors, citation, issue, volume, pages,
    } = SCHEMA_DEFN.Publication.properties;
    const publication = await db.class.get(SCHEMA_DEFN.Publication.name);

    for (const prop of [authors, citation, issue, volume, pages]) {
        await Property.create(prop, publication);
    }
};

const migrate2to3From6xto0x = async (db) => {
    const renames = [
        ['appliesTo', 'subject'],
        ['impliedBy', 'conditions'],
        ['supportedBy', 'evidence'],
    ];

    for (const [oldName, newName] of renames) {
        logger.info(`Rename Statement.${oldName} to Statement.${newName}`);
        await db.command(`ALTER PROPERTY Statement.${oldName} NAME ${newName}`).all();
    }
    // ensure appliesTo/subject is also in impliedBy/conditions for all statements
    const statements = await db.query('SELECT * FROM Statement WHERE subject NOT IN conditions').all();
    logger.info(`${statements.length} statements require updating`);

    for (const { '@rid': rid, conditions, subject } of statements) {
        await db.command(`UPDATE ${rid} SET conditions = [${conditions.join(', ')}, ${subject}]`).all();
    }
};


const logMigration = async (db, name, url, version) => {
    const schemaHistory = await db.class.get('SchemaHistory');
    await schemaHistory.create({
        version,
        name,
        url,
        createdAt: timeStampNow(),
    });
    return version;
};


/**
 * Detects the current version of the db, the version of the node module and attempts
 * to migrate from one to the other
 *
 * @param {orientjs.Db} db the database connection
 */
const migrate = async (db, opt = {}) => {
    const { checkOnly = false } = opt;
    const currentVersion = await _version.getCurrentVersion(db);
    const { version: targetVersion, name, url } = _version.getLoadVersion();

    if (!requiresMigration(currentVersion, targetVersion)) {
        logger.info(`Versions (${currentVersion}, ${targetVersion}) are compatible and do not require migration`);
        return;
    } if (checkOnly) {
        throw new Error(`Versions (${currentVersion}, ${targetVersion}) are not compatible and require migration`);
    }

    let migratedVersion = currentVersion;

    const migrations = [
        ['1.6.2', '1.7.0', migrate16Xto17X],
        ['1.7.0', '1.8.0', migrate17Xto18X],
        ['1.8.0', '1.9.0', migrate18Xto19X],
        ['2.0.0', '2.1.0', migrate2from0xto1x],
        ['2.1.0', '2.2.0', migrate2from1xto2x],
        ['2.2.0', '2.3.0', migrate2from2xto3x],
        ['2.3.0', '2.4.0', migrate2from3xto4x],
        ['2.4.0', '2.5.0', migrate2from4xto5x],
        ['2.5.0', '2.6.0', migrate2from5xto6x],
        ['2.6.0', '3.0.0', migrate2to3From6xto0x],
    ];

    while (requiresMigration(migratedVersion, targetVersion)) {
        let foundMigration = false;

        for (const [minVersion, maxVersion, migrationFunction] of migrations) {
            if (semver.satisfies(migratedVersion, `>=${minVersion} <${maxVersion}`)) {
                foundMigration = true;
                logger.info(`Migrating from ${migratedVersion} (${currentVersion}) to ${maxVersion} (${targetVersion})`);
                await migrationFunction(db);
                migratedVersion = await logMigration(db, name, url, maxVersion);
                break;
            }
        }

        if (!foundMigration) {
            throw new Error(`Unable to find migration scripts from ${migratedVersion} to ${targetVersion}`);
        }
    }

    // update the schema history table
    if (targetVersion !== migratedVersion) {
        await logMigration(db, name, url, targetVersion);
    }
};

module.exports = {
    migrate, requiresMigration,
};
