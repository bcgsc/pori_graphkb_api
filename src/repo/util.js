const {
    error: { AttributeError },
    constants: { PERMISSIONS },
    util: { castToRID },
    schema,
} = require('@bcgsc/knowledgebase-schema');
const { RecordID: RID } = require('orientjs');


/**
 * Join a list of strings as you would for putting into a sentence
 *
 * @param {Array.<string>} list the list to join
 * @returns {string} the joined list
 *
 * @example
 * > naturalListJoin(['a', 'b', 'c'])
 * 'a, b, and c'
 */
const naturalListJoin = (list) => {
    if (list.length === 0) {
        return '';
    }
    let result = list.slice(0, list.length - 1).join(', ');

    if (list.length > 1) {
        result = `${result}, and ${list[list.length - 1]}`;
    }
    return result;
};


/**
 * wrap a string in single quotations
 *
 * @param {string} string the input string
 *
 * @example
 *  >>> quoteWrap('thing')
 *  "'thing'"
 *
 */
const quoteWrap = string => `'${string}'`;


/**
 * @param {Array.<Object>} records the records to be nested
 * @param {Array.<string>} keysList keys to use as levels for nesting
 * @param {?Object} opt options
 * @param {?string} [opt.value=null] the value to use as the lowest level value (if null defaults to entire record)
 * @param {?boolean} [opt.aggregate=true] create a list of records for each grouping
 *
 * @example
 * > groupRecordsBy([{name: 'bob', city: 'van'}, {name: 'alice', city: 'van'}, {name: 'blargh', city: 'monkey'}], ['city'], {value: 'name'})
 * {van: ['bob', 'alice'], monkey: ['blargh']}
 */
const groupRecordsBy = (records, keysList, opt = {}) => {
    const nestedProperty = opt.value || null;
    const aggregate = opt.aggregate === undefined
        ? true
        : opt.aggregate;
    const nested = {};

    // nest counts into objects based on the grouping keys
    for (const record of records) {
        let level = nested;

        for (const groupingKey of keysList.slice(0, -1)) {
            const key = record[groupingKey];

            if (level[key] === undefined) {
                level[key] = {};
            }
            level = level[key];
        }
        const lastKey = record[keysList.slice(-1)];

        if (aggregate) {
            if (level[lastKey] === undefined) {
                level[lastKey] = [];
            }
            if (nestedProperty) {
                level[lastKey].push(record[nestedProperty]);
            } else {
                level[lastKey].push(record);
            }
        } else if (level[lastKey] === undefined) {
            level[lastKey] = nestedProperty
                ? record[nestedProperty]
                : record;
        } else {
            throw new AttributeError('grouping is not unique. Must aggregate for non-unique groupings');
        }
    }
    return nested;
};


/**
 * Given a list of records, removes any object which contains a non-null deletedAt property
 *
 * @param {Array.<Object>} recordList list of records to be trimmed
 * @param {Object} opt options
 * @param {boolean} [opt.history=false] include deleted records
 * @param {User} [opt.user=null] if the user object is given, will check record-level permissions and trim any non-permitted content
 */
const trimRecords = async (recordList, { history = false, user = null } = {}) => {
    const queue = recordList.slice();
    const visited = new Set();
    const readableClasses = new Set();
    const allGroups = new Set();

    if (user) {
        for (const group of user.groups) {
            allGroups.add(castToRID(group).toString());

            for (const [cls, permissions] of Object.entries(group.permissions || {})) {
                if (permissions & PERMISSIONS.READ) {
                    readableClasses.add(cls);
                }
            }
        }
    }

    const accessOk = (record) => {
        if (user) {
            const cls = record['@rid'] === undefined // embedded records cannot have class-level permissions checks and will not have @rid's
                ? null
                : record['@class'];

            if (cls && !readableClasses.has(cls)) {
                return false;
            }
            if (!record.groupRestrictions || record.groupRestrictions.length === 0) {
                return true;
            }

            for (let group of record.groupRestrictions || []) {
                group = castToRID(group).toString();

                if (allGroups.has(group)) {
                    return true;
                }
            }
            return false;
        }
        return true;
    };

    while (queue.length > 0) {
        const curr = queue.shift(); // remove the first element from the list
        const currRID = curr['@rid']
            ? castToRID(curr['@rid'])
            : null;

        if (visited.has(curr)) { // avoid infinite look from cycles
            continue;
        }
        visited.add(curr);
        const keys = Array.from(Object.keys(curr));
        const model = curr['@class'] && schema.schema[curr['@class']];
        const queryProperties = model
            ? model.queryProperties
            : null;

        for (const attr of keys) {
            const value = curr[attr];

            if (attr === '@type' || attr === '@version' || attr.startsWith('_$')) {
                delete curr[attr];
            } else if (attr === 'history' && history && value) {
                curr[attr] = castToRID(value);
            } else if (value instanceof RID) {
                if (value.cluster < 0) { // abstract, remove
                    delete curr[attr];
                }
            } else if (typeof value === 'object' && value && value['@rid']) {
                if (!accessOk(value) || (!history && value.deletedAt)) {
                    delete curr[attr];
                } else {
                    queue.push(value);
                }
            } else if (attr.startsWith('out_') || attr.startsWith('in_')) {
                if (!value || value.length === 0) {
                    delete curr[attr];
                } else {
                // check here for updated edges that have not been removed
                // https://github.com/orientechnologies/orientjs/issues/32
                    const arr = [];

                    for (const edge of value) {
                        const edgeCheck = edge;

                        if (!edge.out || !edge.in) {
                            arr.push(edge);
                            continue;
                        }
                        if (edgeCheck.out
                        && edgeCheck.in
                        && castToRID(edgeCheck.out).toString() !== currRID.toString()
                        && castToRID(edgeCheck.in).toString() !== currRID.toString()
                        ) {
                            continue;
                        } else if (!accessOk(edge)) {
                            continue;
                        }
                        queue.push(edge);
                        arr.push(edge);
                    }
                    curr[attr] = arr;
                }
            } else if (value === null && queryProperties && !queryProperties[attr]) {
                delete curr[attr];
            }
        }
    }
    // remove the top level elements last
    const result = [];

    for (const record of recordList) {
        if (accessOk(record)) {
            if (history || !record.deletedAt) {
                result.push(record);
            }
        }
    }
    return result;
};


module.exports = {
    groupRecordsBy,
    naturalListJoin,
    quoteWrap,
    trimRecords,
};
