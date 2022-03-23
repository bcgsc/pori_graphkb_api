/**
 * Contains all functions for directly interacting with the database
 */
/**
 * @ignore
 */
import _ from 'lodash';
import orientjs from 'orientjs';
import gkbSchema from '@bcgsc-pori/graphkb-schema';
const {
    util: { castToRID, timeStampNow },
    error: { AttributeError },
    constants: { PERMISSIONS },
    schema: schemaDefn,
} = gkbSchema;

import { logger } from '../logging';

import {
    NotImplementedError,
    PermissionError,
    RecordConflictError
} from '../error';
import {
    wrapIfTypeError, hasRecordAccess,
} from './util';
import { select, fetchDisplayName } from './select';
import { nestedProjection } from '../query_builder/projection';
import { parse } from '../query_builder';
import { checkUserAccessFor } from '../../middleware/auth';

/**
 * Create the transaction to copy the current node as history and then update the current node
 * with the changes
 *
 * @param {orientjs.Db} db the database connection object
 * @param {Object} opt options
 * @param {Object} opt.changes the changes to the edge properties. Null for deletions
 * @param {Object} opt.original the original edge record to be updated
 * @param {Object} opt.user the user performing the record update
 */
const updateStatementTx = async (db: orientjs.Db, opt) => {
    const { original, changes } = opt;
    const userRID = castToRID(opt.user);
    const { Statement: model } = schemaDefn.schema;

    const content = model.formatRecord(omitDBAttributes(original), {
        addDefaults: false,
        dropExtra: true,
    });

    if (changes.subject) {
        if (changes.conditions) {
            if (!changes.conditions.includes(changes.subject)) {
                changes.conditions.push(castToRID(changes.subject));
            }
        } else {
            changes.conditions = [...original.conditions, castToRID(changes.subject)];
        }
    } else if (changes.conditions) {
        // conditions must contain the subject
        if (!changes.conditions.includes(original.subject)) {
            changes.conditions.push(castToRID(original.subject));
        }
    }

    if (!changes.displayNameTemplate) {
        const postUpdateRecord = { ...content, ...changes };
        changes.displayNameTemplate = await fetchDisplayName(db, model, postUpdateRecord);
    }

    content.deletedAt = timeStampNow();
    content.deletedBy = userRID;
    changes.updatedBy = userRID;
    changes.updatedAt = timeStampNow();
    const formattedChanges = model.formatRecord(omitDBAttributes(changes), {
        addDefaults: false,
        dropExtra: true,
        ignoreMissing: true,
    });

    const commit = db
        .let('copy', (tx) => tx.create('VERTEX', 'Statement')
            .set(content));

    commit
        .let('updated', (tx) => tx.update(original['@rid'])
            .set(formattedChanges)
            .set('history = $copy[0]')
            .where({ createdAt: original.createdAt })
            .return('AFTER @rid'))
        .let('result', (tx) => tx.select()
            .from(original['@class']).where({ '@rid': original['@rid'] }));

    return commit.commit();
};

/**
 * Create the transaction to copy the current node as history and then update the current node
 * with the changes
 *
 * @param {orientjs.Db} db the database connection object
 * @param {Object} opt options
 * @param {Object} opt.changes the changes to the edge properties. Null for deletions
 * @param {Object} opt.original the original edge record to be updated
 * @param {Object} opt.user the user performing the record update
 */
const updateNodeTx = async (db: orientjs.Db, opt) => {
    const { original, changes, model } = opt;

    if (model.name === 'Statement') {
        return updateStatementTx(db, opt);
    }
    const userRID = castToRID(opt.user);

    const content = model.formatRecord(omitDBAttributes(original), {
        addDefaults: false,
        dropExtra: true,
    });

    const postUpdateRecord = _.omit(
        { ...content, ...changes },
        ['displayName', 'break1Repr', 'break2Repr'],
    );

    if (model.name === 'PositionalVariant') {
        // break1Repr and break2Repr require re-generating when changes are made
        const reformatted = model.formatRecord(postUpdateRecord, { addDefaults: true });
        changes.break1Repr = reformatted.break1Repr;
        changes.break2Repr = reformatted.break2Repr;
        Object.assign(postUpdateRecord, changes);
    }

    // regenerate the displayName if it was not given
    if (!changes.displayName && model.properties.displayName) {
        changes.displayName = await fetchDisplayName(db, model, postUpdateRecord);
    }
    content.deletedAt = timeStampNow();
    content.deletedBy = userRID;

    if (model.inherits.includes('V')) {
        changes.updatedBy = userRID;
        changes.updatedAt = timeStampNow();
    } else {
        changes.createdBy = userRID;
        changes.createdAt = timeStampNow();
    }

    let commit;

    if (model.inherits.includes('V')) {
        commit = db
            .let('copy', (tx) => tx.create('VERTEX', original['@class'])
                .set(content));
    } else {
        commit = db
            .let('copy', (tx) => tx.insert().into(original['@class'])
                .set(content));
    }
    commit
        .let('updated', (tx) => tx.update(original['@rid'])
            .set(omitDBAttributes(changes))
            .set('history = $copy[0]')
            .where({ createdAt: original.createdAt })
            .return('AFTER @rid'))
        .let('result', (tx) => tx.select()
            .from(original['@class']).where({ '@rid': original['@rid'] }));

    return commit.commit();
};

/**
 * Update or delete an existing edge and its source/target nodes
 * Creates the transaction to update/copy and relink nodes/edges when an edge requires updating
 * 1. copy src node as srcCopy
 * 2. link srcCopy to src as history
 * 3. copy tgt node as tgtCopy
 * 4. link tgtCopy to tgt as history
 * 5. copy e as eCopy from srcCopy to tgtCopy
 * 6. link eCopy to e as history
 *
 * @param {orientjs.Db} db the database connection object
 * @param {Object} opt options
 * @param {Object} opt.changes the changes to the edge properties. Null for deletions
 * @param {Object} opt.original the original edge record to be updated
 * @param {Object} opt.user the user performing the record update
 */
const modifyEdgeTx = async (db: orientjs.Db, opt) => {
    const { original, changes, user } = opt;
    const userRID = castToRID(user);
    const [src, tgt] = await db.record.get([original.out, original.in]);

    // check that the user has permissions to update at least one of the from/to vertices
    if (!checkUserAccessFor(user, src['@class'], PERMISSIONS.DELETE)
        && !checkUserAccessFor(user, tgt['@class'], PERMISSIONS.DELETE)
    ) {
        throw new PermissionError(`user has insufficient permissions to delete edges between records of types (${src['@class']}, ${tgt['@class']})`);
    }

    const srcCopy = omitDBAttributes(src);
    srcCopy.deletedAt = timeStampNow();
    srcCopy.deletedBy = userRID;

    const tgtCopy = omitDBAttributes(tgt);
    tgtCopy.deletedAt = timeStampNow();
    tgtCopy.deletedBy = userRID;

    const edgeCopy = _.omit(omitDBAttributes(original), ['in', 'out']);
    edgeCopy.deletedAt = timeStampNow();
    edgeCopy.deletedBy = userRID;

    if (changes) {
        changes.createdAt = timeStampNow();
        changes.createdBy = userRID;
    }
    // create the transaction to update the edge. Uses the createdAt stamp to avoid concurrency errors
    const commit = db
        .let('srcCopy', (tx) => tx.create('VERTEX', src['@class'])
            .set(srcCopy))
        .let('src', (tx) => tx.update(src['@rid'])
            .set('history = $srcCopy[0]')
            .set({ createdAt: timeStampNow(), createdBy: userRID })
            .where({ createdAt: src.createdAt })
            .return('AFTER @rid'))
        .let('tgtCopy', (tx) => tx.create('VERTEX', tgt['@class'])
            .set(tgtCopy))
        .let('tgt', (tx) => tx.update(tgt['@rid'])
            .set('history = $tgtCopy[0]')
            .set({ createdAt: timeStampNow(), createdBy: userRID })
            .where({ createdAt: tgt.createdAt })
            .return('AFTER @rid'));

    if (changes === null) {
        // deletion
        commit
            .let('deleted', (tx) => tx.update(`EDGE ${original['@rid']}`)
                .where({ createdAt: original.createdAt })
                .set('out = $srcCopy[0]').set('in = $tgtCopy[0]')
                .set({ deletedAt: timeStampNow(), deletedBy: userRID })
                .return('AFTER @rid'))
            .let('result', (tx) => tx.select().from(original['@class']).where({ '@rid': original['@rid'] }));
        // .let('result', tx => tx.select('*, *:{*, @rid, @class}').from('(select expand($deleted[0]))')); // See https://github.com/orientechnologies/orientdb/issues/8786
    } else {
        // edge update
        throw new NotImplementedError('Cannot update edges. Waiting on external fix: https://github.com/orientechnologies/orientdb/issues/8444');
        /* TODO: Fix after getting feedback
        commit
            .let('edgeCopy', tx => tx.create('EDGE', original['@class'])
                .set(edgeCopy).from('$srcCopy').to('$tgtCopy'))
            .let('updatedRID', tx => tx.update(original['@rid'])
                .set(changes).set('history = $edgeCopy').set(changes)
                .where({createdAt: original.createdAt})
                .return('AFTER @rid'))
            .let('result', tx => tx.select().from('$updatedRID').fetch({'*': 1}));
        */
    }
    return commit.commit();
};

/**
 * Creates the transaction to delete a node and all of its surrounding edges
 * This requires copy all neighbors and modifying any immediate edges in
 * addition to the modifying the current node
 *
 * @param {orientjs.Db} db the database connection object
 * @param {Object} opt options
 */
const deleteNodeTx = async (db: orientjs.Db, opt) => {
    const { original } = opt;
    const userRID = castToRID(opt.user);
    const commit = db
        .let('deleted', (tx) => tx.update(original['@rid'])
            .set({ deletedAt: timeStampNow(), deletedBy: userRID })
            .where({ createdAt: original.createdAt }));
    const updatedVertices = {}; // mapping of rid string to let variable name
    let edgeCount = 0;

    for (const attr of Object.keys(original)) {
        let direction;

        if (attr.startsWith('out_')) {
            direction = 'in';
        } else if (attr.startsWith('in_')) {
            direction = 'out';
        } else {
            continue;
        }

        // back up the target vetex
        for (const value of original[attr]) {
            const targetNode = value[direction];
            const target = castToRID(targetNode);
            const targetContent = omitDBAttributes(targetNode);
            targetContent.deletedAt = timeStampNow();
            targetContent.deletedBy = userRID;

            // clean any nested content
            for (const [subAttr, subValue] of Object.entries(targetContent)) {
                if (subValue['@rid'] !== undefined) {
                    targetContent[subAttr] = castToRID(subValue);
                }
            }

            // if the vertex has already been copied do not recopy it
            if (updatedVertices[target.toString()] === undefined) {
                const name = `newVertex${Object.keys(updatedVertices).length}`;
                commit
                    .let(name, (tx) => tx.create('VERTEX', targetNode['@class'])
                        .set(targetContent))
                    .let(`vertex${Object.keys(updatedVertices).length}`, (tx) => tx.update(target)
                        .set(`history = $${name}[0]`)
                        .set({ createdAt: timeStampNow(), createdBy: userRID })
                        .where({ createdAt: targetContent.createdAt })
                        .return('AFTER @rid'));
                updatedVertices[target.toString()] = name;
            }

            // move the current edge to point to the copied node
            edgeCount += 1;
            commit.let(`edge${edgeCount}`, (tx) => tx.update(castToRID(value))
                .set({ deletedAt: timeStampNow(), deletedBy: userRID })
                .set(`${direction} = $${updatedVertices[target.toString()]}[0]`)
                .where({ createdAt: value.createdAt })
                .return('AFTER @rid'));
        }
    }
    commit.let('result', (tx) => tx.select().from(original['@class']).where({ '@rid': original['@rid'] }));
    return commit.commit();
};

/**
 * Check if the record to be deleted is used by some links
 *
 * @param {orientjs.Db} db database connection object
 * @param {ClassModel} model the model of the current record
 * @param {string} ridToDelete the recordId being deleted
 */
const deletionLinkChecks = async (db: orientjs.Db, model, ridToDelete) => {
    if (model.name === 'Vocabulary') {
        // check variants
        let [{ count }] = await select(db, parse({
            count: true,
            filters: {
                type: ridToDelete,
            },
            target: 'Variant',
        }));

        if (count > 0) {
            throw new RecordConflictError(`Cannot delete ${ridToDelete} since it is used by ${count} Variant records`);
        }
        // check statements
        [{ count }] = await select(db, parse({
            count: true,
            filters: {
                OR: [
                    { conditions: ridToDelete, operator: 'CONTAINS' },
                    { evidence: ridToDelete, operator: 'CONTAINS' },
                    { subject: ridToDelete },
                ],
            },
            target: 'Statement',
        }));

        if (count > 0) {
            throw new RecordConflictError(`Cannot delete ${ridToDelete} since it is used by ${count} Statement records`);
        }
    } else if (model.inherits.includes('Ontology')) {
        // check variants
        let [{ count }] = await select(db, parse({
            count: true,
            filters: {
                OR: [
                    { reference1: ridToDelete },
                    { reference2: ridToDelete },
                ],
            },
            target: 'Variant',
        }));

        if (count > 0) {
            throw new RecordConflictError(`Cannot delete ${ridToDelete} since it is used by ${count} Variant records`);
        }
        // check statements
        [{ count }] = await select(db, parse({
            count: true,
            filters: {
                OR: [
                    { conditions: ridToDelete, operator: 'CONTAINS' },
                    { evidence: ridToDelete, operator: 'CONTAINS' },
                    { subject: ridToDelete },
                ],
            },
            target: 'Statement',
        }));

        if (count > 0) {
            throw new RecordConflictError(`Cannot delete ${ridToDelete} since it is used by ${count} Statement records`);
        }
    }
};

/**
 * uses a transaction to copy the current record into a new record
 * then update the actual current record (to preserve links)
 * the link the copy to the current record with the history link
 *
 * @param {orientjs.Db} db orientjs database connection
 * @param {Object} opt options
 * @param {ClassModel} opt.model the model to use in formatting the record changes
 * @param {Object} opt.changes the content for the new node (any unspecified attributes are assumed to be unchanged)
 * @param {Query} opt.query the selection criteria for the original node
 * @param {Object} opt.user the user updating the record
 */
const modify = async (db: orientjs.Db, opt) => {
    const {
        model, user, query, paranoid = true,
    } = opt;

    if (!query || !model || !user) {
        throw new AttributeError('missing required argument');
    }
    if (paranoid) {
        query.projection = nestedProjection(2);
    }
    // select the original record and check permissions
    // select will also throw an error when the user attempts to modify a deleted record

    const [original] = await select(db, query, {
        exactlyN: 1,
    });

    if (!hasRecordAccess(user, original)) {
        throw new PermissionError(`The user '${user.name}' does not have sufficient permissions to interact with record ${original['@rid']}`);
    }

    // check for outstanding links before deleting
    if (opt.changes === null) {
        await deletionLinkChecks(db, model, original['@rid'].toString());
    }

    // now delete the record
    const changes = opt.changes === null
        ? null
        : ({
            ...model.formatRecord(opt.changes, {
                addDefaults: false,
                dropExtra: false,
                ignoreExtra: false,
                ignoreMissing: true,
            }),
        });

    if (!paranoid) {
        try {
            const { count } = await db.update(castToRID(original)).set(changes).one();

            if (count !== 1) {
                throw new Error('Failed to modify');
            }
            return count;
        } catch (err) {
            throw wrapIfTypeError(err);
        }
    } else {
        let commit;

        if (model.isEdge) {
            commit = await modifyEdgeTx(db, { changes, original, user });
        } else if (changes === null) {
            // vertex deletion
            commit = await deleteNodeTx(db, { original, user });
        } else {
            // vertex update
            commit = await updateNodeTx(db, {
                changes, model, original, user,
            });
        }
        logger.log('debug', commit.buildStatement());

        try {
            const result = await commit.return('$result').one();

            if (!result) {
                throw new Error('Failed to modify');
            }
            return result;
        } catch (err) {
            err.sql = commit.buildStatement();
            throw wrapIfTypeError(err);
        }
    }
};

/**
 * Update a node or edge.
 *
 * @param {orientjs.Db} db orientjs database connection
 * @param {Object} opt options
 * @param {Object} opt.changes the new content to be set for the node/edge
 * @param {Query} opt.query the selection criteria for the original node
 * @param {Object} opt.user the user updating the record
 * @param {ClassModel} opt.model
 */
const update = async (db: orientjs.Db, opt) => {
    if (opt.changes === null || opt.changes === undefined) {
        throw new AttributeError('opt.changes is a required argument');
    }
    return modify(db, opt);
};

/**
 * Delete a record by marking it deleted. For node, delete the connecting edges as well.
 *
 * @param {orientjs.Db} db orientjs database connection
 * @param {Object} opt options
 * @param {Query} opt.query the selection criteria for the original node
 * @param {Object} opt.user the user updating the record
 * @param {ClassModel} opt.model the class model
 */
const remove = async (db: orientjs.Db, opt) => modify(db, { ...opt, changes: null });

export {
    modifyEdgeTx,
    remove,
    update,
};
