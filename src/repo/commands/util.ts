import _ from 'lodash';

import gkbSchema from '@bcgsc-pori/graphkb-schema';
const { util: { castToRID } } = gkbSchema;

import { NoRecordFoundError,
    RecordConflictError,
    DatabaseConnectionError,
    DatabaseRequestError } from '../error';

/**
 * Check if the error is a particular type (expected from orientdb) and return an instance of the
 * corresponding error class
 */
const wrapIfTypeError = (err) => {
    if (err) {
        if (err.type) {
            const type = err.type.toLowerCase();

            if (type.includes('orecordduplicatedexception')) {
                return new RecordConflictError(err);
            } if (type.includes('orecordnotfoundexception')) {
                return new NoRecordFoundError(err);
            } if (type.includes('odatabaseexception')) {
                return new DatabaseConnectionError(err);
            }
        }
        if (err.name) {
            if (err.name.includes('OrientDB.ConnectionError')) {
                return new DatabaseConnectionError(err);
            }
            if (err.name.includes('OrientDB.RequestError')) {
                const {
                    name, type, message, sql,
                } = err;
                // error messages exceed 500 lines and are unreadable
                const trimmed = message.split('\n').filter((line) => !/^\s*[<"].*\s*\.\.\.\s*$/.exec(line)).join('\n');
                return new DatabaseRequestError({
                    message: trimmed, name, sql, type,
                });
            }
        }
    }
    return err;
};

const omitDBAttributes = (rec) => _.omit(rec, Object.keys(rec).filter(
    (k) => k.startsWith('@')
        || k.startsWith('out_')
        || k.startsWith('in_')
        || k.startsWith('_'),
));

/**
 * Check if the user has sufficient access
 *
 * @param {Object} user the user
 * @param {Object} record the record the user wishes to access
 * @param {Array} record.groupRestrictions an array of groups that are allowed to access the record. If empty, then all groups are allowed access
 *
 * @returns {boolean} flag to indicate if the user is allowed access to the record
 */
const hasRecordAccess = (user, record) => {
    if (!record.groupRestrictions || record.groupRestrictions.length === 0) {
        return true;
    }

    for (let rgroup of record.groupRestrictions) {
        rgroup = castToRID(rgroup).toString();

        for (let ugroup of user.groups) {
            ugroup = castToRID(ugroup).toString();

            if (rgroup === ugroup) {
                return true;
            }
        }
    }
    return false;
};

export {
    hasRecordAccess, omitDBAttributes, wrapIfTypeError,
};
