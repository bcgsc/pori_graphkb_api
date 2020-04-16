/**
 * This module will contain migrations that are determined by the content of the SchemaHistory table
 */

const { RID } = require('orientjs');
const semver = require('semver');

const {
    constants,
    schema: { schema: SCHEMA_DEFN },
    util: { timeStampNow },
    sentenceTemplates: { chooseDefaultTemplate },
} = require('@bcgsc/knowledgebase-schema');

constants.RID = RID; // IMPORTANT: Without this all castToRID will do is convert to a string
const { PERMISSIONS } = constants;

const { logger } = require('./../logging');
const { Property, ClassModel } = require('../model');
const { generateDefaultGroups } = require('../schema');

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

    const { properties } = SCHEMA_DEFN.Statement;
    const statement = await db.class.get(SCHEMA_DEFN.Statement.name);

    for (const [oldName, newName] of renames) {
        const prop = properties[newName];
        logger.info(`Create new Property Statement.${newName}`);
        await Property.create(prop, statement);

        logger.info(`copy content Statement.${oldName} to Statement.${newName}`);
        await db.command(`UPDATE Statement SET ${newName} = ${oldName}`).all();

        logger.info(`Drop old property Statement.${oldName}`);
        await db.command(`DROP PROPERTY Statement.${oldName} FORCE`).all(); // also drop indexes on these properties

        logger.info(`Remove old property ${oldName} from existing Statement records`);
        await db.command(`UPDATE Statement REMOVE ${oldName}`).all();
    }

    logger.info('Update statement displayNameTemplate');
    await db.command(`UPDATE Statement
        SET displayNameTemplate = displayNameTemplate
            .replace('{appliesTo}', '{subject}')
            .replace('{supportedBy}', '{evidence}')
            .replace('{impliedBy}', '{conditions}')`);

    // ensure appliesTo/subject is also in impliedBy/conditions for all statements
    const statements = await db.query('SELECT * FROM Statement WHERE subject NOT IN conditions AND subject IS NOT NULL').all();
    logger.info(`${statements.length} statements require updating (subject must be in conditions)`);

    for (const { '@rid': rid, conditions, subject } of statements) {
        await db.command(`UPDATE ${rid} SET conditions = [${conditions.join(', ')}, ${subject}]`).all();
    }

    // remake any indices
    await ClassModel.create(SCHEMA_DEFN.Statement, db, { properties: false, indices: true, graceful: true });
};


const migrate3From0xto1x = async (db) => {
    // remake any missing indices (were renamed here)
    await ClassModel.create(SCHEMA_DEFN.Statement, db, { properties: false, indices: true, graceful: true });

    // add source.sort property
    logger.info('Adding Source.sort property');
    const { sort } = SCHEMA_DEFN.Source.properties;
    const source = await db.class.get(SCHEMA_DEFN.Source.name);
    await Property.create(sort, source);
};


const migrate3From1xto2x = async (db) => {
    // convert evidence level to a linkset
    logger.info('Converting Statement.evidenceLevel to a linkset instead of a link');

    // create temp property
    const tempProp = 'tempEvidenceLevels';
    logger.info(`Adding Statement.${tempProp} property`);
    const { evidenceLevel } = SCHEMA_DEFN.Statement.properties;
    const Statement = await db.class.get(SCHEMA_DEFN.Statement.name);
    await Property.create({ ...evidenceLevel, name: tempProp }, Statement);

    logger.info('Copying the data into the new property');
    await db.command(`UPDATE Statement SET ${tempProp} = [evidenceLevel] WHERE evidenceLevel IS NOT NULL`);
    // drop the index on evidence level
    logger.info('Drop the index on the current property');
    await db.command('DROP INDEX Statement.evidenceLevel');
    // delete the property
    logger.info('Dropping the current property');
    await db.command('UPDATE Statement REMOVE evidenceLevel');
    await db.command('DROP Property Statement.evidenceLevel FORCE'); // FORCE = also drop indices
    // rename the temp property to the old name
    await db.command(`ALTER PROPERTY Statement.${tempProp} NAME evidenceLevel`);
    // re-build the indices
    logger.info('Indexing Statement.evidenceLevel');
    await db.index.create(
        SCHEMA_DEFN.Statement.indices.find(item => item.name === 'Statement.evidenceLevel'),
    );
};


const migrate3From2xto3x = async (db) => {
    // add the new user groups
    // modify the permissions on the existing groups
    logger.info('fetching the existing user groups');
    const groups = await db.query('SELECT * FROM UserGroup where deletedAt IS NULL').all();

    // create the default user groups
    const userGroups = generateDefaultGroups();

    logger.info('get the user group class');

    for (const group of userGroups) {
        const existing = groups.find(g => g.name === group.name);

        if (!existing) {
            logger.info(`creating the user group (${group.name})`);
            const content = SCHEMA_DEFN.UserGroup.formatRecord(group, { addDefaults: true });
            await db.insert().into(SCHEMA_DEFN.UserGroup.name).set(content).one();
        } else {
            logger.info(`updating the group (${group.name}) permissions`);
            await db.update(existing['@rid']).set({ permissions: group.permissions }).one();
        }
    }
};


const migrate3From3xto4x = async (db) => {
    // add the new user groups
    // modify the permissions on the existing groups
    logger.info('assigning new statement templates');
    const statements = await db.query(`
        SELECT @rid,
            conditions:{@rid,@class,displayName,name},
            relevance:{@rid,@class,displayName,name},
            subject:{@rid,@class,displayName,name},
            evidence:{@rid,@class,displayName},
            displayNameTemplate
        FROM Statement
        WHERE deletedAt IS NULL`).all();

    const updatedTemplates = {};

    for (const statement of statements) {
        let newTemplate = statement.displayNameTemplate;

        try {
            newTemplate = chooseDefaultTemplate(statement);
        } catch (err) {
            logger.warn(`Failed to assign a new default template to statement (${statement['@rid']})`);
            continue;
        }

        if (newTemplate !== statement.displayNameTemplate) {
            if (updatedTemplates[newTemplate] === undefined) {
                updatedTemplates[newTemplate] = [];
            }
            updatedTemplates[newTemplate].push(statement['@rid']);
        }
    }

    for (const [template, recordList] of Object.entries(updatedTemplates)) {
        logger.info(`Updating ${recordList.length} statements to use the template "${template}"`);
        await db.command(`UPDATE Statement SET displayNameTemplate = :template WHERE @rid IN [${
            recordList.map(r => r.toString()).join(', ')
        }]`, { params: { template } }).all();
    }
};

const migrate3From4xto5x = async (db) => {
    // add the new user groups
    // modify the permissions on the existing groups
    logger.info('recreate fulltext index');

    for (const index of SCHEMA_DEFN.Ontology.indices.filter(i => i.type === 'FULLTEXT')) {
        await db.command(`DROP INDEX ${index.name}`).all();
        await db.index.create(index);
    }
};

const migrate3From5xto6x = async (db) => {
    // add the new user groups
    // modify the permissions on the existing groups
    logger.info('default all empty Ontology.name to value of Ontology.sourceId');
    await db.command('UPDATE Ontology SET name = sourceId WHERE name IS NULL').all();

    logger.info('adding the not null constraint to Ontology.name');
    await db.command('ALTER PROPERTY Ontology.name NOTNULL true').all();
};

const migrate3xFrom6xto7x = async (db) => {
    logger.info('creating the new LicenseAgreement Table');
    await ClassModel.create(SCHEMA_DEFN.LicenseAgreement, db);
    await addClassToPermissionsSchema(db, SCHEMA_DEFN.LicenseAgreement);

    // create the first agreement
    const content = [
        { label: 'Copyright', id: 'copyright', content: 'Canada\'s Michael Smith Genome Sciences Centre retains ownership of all intellectual property rights of any kind related to the Platform and Service, including applicable copyrights, patents, trademarks, and other proprietary rights. Other trademarks, service marks, graphics and logos used in connection with the GraphKB platform and its services may be the trademarks of users and third parties. Canada\'s Michael Smith Genome Sciences Centre does not transfer to users any intellectual property. All rights, titles and interests in and to such property will remain solely with the original owner. Canada\'s Michael Smith Genome Sciences Centre reserve all rights that are not expressly granted under this Term of Use.' },
        { label: 'Use of GraphKB', id: 'useof', content: 'Your access to GraphKB on this platform is provided under, and subject to specific license agreements. Except as specifically permitted, no portion of this web site may be distributed or reproduced by any means, or in any form, without the explicit written permission of Canada\'s Michael Smith Genome Sciences Centre. In particular, you agree not to reproduce, retransmit, distribute, disseminate, sell, publish, broadcast, or circulate the information owned by Canada\'s Michael Smith Genome Sciences Centre, or received from any other party or individual through the GraphKB platform to anyone, including but not limited to others in your organization. To obtain a license for use of GraphKB other than as expressly granted in these terms of use, including for commercial purposes, please contact graphkb@bcgsc.ca' },
        { label: 'Third-Party Platforms, Products, and Services', id: 'thirdparty', content: 'Canada\'s Michael Smith Genome Sciences Centre and its affiliates do not assert any proprietary rights, or make any recommendations or endorsements about third-party products and services. References to third-party services and products are provided by GraphKB "AS IS", without warranty of any kind, either express or implied. Some GraphKB data may be subject to the copyright of third parties; you should consult these entities for any additional terms of use. \n\nSome GraphKB content may provide links to other Internet sites for the convenience of users. Canada\'s Michael Smith Genome Sciences Centre and its affiliates are not responsible for the availability or content of these external sites, nor does it endorse, warrant, or guarantee the products, services, or information described or offered at these other Internet sites. Users cannot assume that the external sites will abide by the same Privacy Policy to which Canada\'s Michael Smith Genome Sciences Centre and its affiliates adhere. It is the responsibility of the user to examine the copyright and licensing restrictions of linked pages and to secure all necessary permissions.' },
        { label: 'Disclaimers', id: 'disclaimers', content: 'You acknowledge that your use of the GraphKB platform is at your sole risk and that you assume full responsibility for all risk associated therewith. GraphKB and the GraphKB content are intended to be used only as general education and scientific reference tools. By using GraphKB, you expressly acknowledge and agree that use of GraphKB and the GraphKB content are at your sole risk. The BC Cancer Genome Sciences Centre and its affiliates do not warrant the accuracy of the GraphKB content. You acknowledge that Canada\'s Michael Smith Genome Sciences Centre and its affiliates are not providing medical, diagnostic or any other advice through GraphKB or by providing access to GraphKB content on the platform. The GraphKB content is not intended as a substitute for professional medical advice, diagnosis or treatment.' },
        { label: 'Limitation of Liability', id: 'limits', content: 'In no event shall Canada\'s Michael Smith Genome Sciences Centre be liable for any damages or other liability to you or any other users of the GraphKB platform. To the maximum extent permitted by law, in no event shall Canada\'s Michael Smith Genome Sciences Centre or any of its affiliates be liable for any special, punitive, indirect, incidental or consequential damages, including but not limited to personal injury, wrongful death, loss of goodwill, loss of use, loss of profits, interruption of service or loss of data, whether in any action in warranty, contract, tort or any other theory of liability (including, but not limited to negligence or fundamental breach), or otherwise arising out of or in any way connected with the use of, reliance on, or the inability to use, the GraphKB platform or any service offered through the GraphKB platform or any material or information contained in, accessed through, or information, products or services obtained through this platform, even if an authorized representative of GraphKB or Canada\'s Michael Smith Genome Sciences Centre is advised of the likelihood or possibility of the same. To the extent any of the above limitations of liability are restricted by applicable federal, state or local law, such limitations shall not apply to the extent of such restrictions.' },
        { label: 'Modification of Terms of Use', id: 'terms', content: 'Canada\'s Michael Smith Genome Sciences Centre reserves the right, at its sole discretion, to amend these Terms of Use at any time and will update these Terms of Use in the event of any such amendments. Users are expected to periodically check the Terms of Use for any amendments, but Canada\'s Michael Smith Genome Sciences Centre will take reasonable steps to notify users of significant material changes. Users continued use of the platform and/or the services following such changes shall constitute their affirmative acknowledgment of the Terms of Use, the modification, and agreement to abide and be bound by the Terms of Use, as amended.' },
    ];

    await db.insert().into(SCHEMA_DEFN.LicenseAgreement.name).set({
        content,
        enactedAt: timeStampNow(),
    }).one();

    logger.info('Adding the signedLicenseAt property to User');

    const { signedLicenseAt } = SCHEMA_DEFN.User.properties;
    const dbClass = await db.class.get(SCHEMA_DEFN.User.name);
    await Property.create(signedLicenseAt, dbClass);
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
        ['3.0.0', '3.1.0', migrate3From0xto1x],
        ['3.1.0', '3.2.0', migrate3From1xto2x],
        ['3.2.0', '3.3.0', migrate3From2xto3x],
        ['3.3.0', '3.4.0', migrate3From3xto4x],
        ['3.4.0', '3.5.0', migrate3From4xto5x],
        ['3.5.0', '3.6.0', migrate3From5xto6x],
        ['3.6.0', '3.7.0', migrate3xFrom6xto7x],
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
