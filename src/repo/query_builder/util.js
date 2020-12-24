const { RecordID: RID } = require('orientjs');
const {
    error: { AttributeError },
    util: { castInteger },
} = require('@bcgsc-pori/graphkb-schema');
const { MAX_LIMIT, MAX_NEIGHBORS } = require('./constants');

/**
 * Format a value as an Integer. Throw an error if it is not an integer or does not
 * fall within the given range
 *
 * @param value the value to be cast
 * @param {?Number} min the minimum allowed value. If null then no minimum is enforced
 * @param {?Number} max the maximum allowed value. If null then no maximum is enforced
 *
 * @returns {Number} the cast integer value
 * @throws {AttributeError} on bad input
 */
const castRangeInt = (value, min, max) => {
    const castValue = castInteger(value);

    if (min !== null && castValue < min) {
        throw new AttributeError(`value (${castValue}) must be greater than or equal to ${min}`);
    }
    if (max !== null && castValue > max) {
        throw new AttributeError(`value (${castValue}) must be less than or equal to ${max}`);
    }
    return castValue;
};

const castBoolean = (value) => {
    const castValue = value.toString().toLowerCase();

    if (['t', 'true', '1'].includes(castValue)) {
        return true;
    } if (['f', 'false', '0', 'null'].includes(castValue)) {
        return false;
    }
    throw new AttributeError(`Expected a boolean value but found ${castValue}`);
};


const getQueryableProps = (model, includeEmbedded = false) => {
    const allProps = {};

    for (const prop of Object.values(model.queryProperties)) {
        if (prop.linkedClass && !prop.iterable && prop.type.includes('embedded')) {
            if (includeEmbedded) {
                allProps[prop.name] = prop;
            }

            for (const [subKey, subprop] of Object.entries(getQueryableProps(prop.linkedClass))) {
                allProps[`${prop.name}.${subKey}`] = subprop;
            }
        } else {
            allProps[prop.name] = prop;
        }
    }
    return allProps;
};


/**
 * @param {object} opt the query options
 * @param {Number} opt.skip the number of records to skip (for paginating)
 * @param {Array.<string>} opt.orderBy the properties used to determine the sort order of the results
 * @param {string} opt.orderByDirection the direction to order (ASC or DESC)
 * @param {boolean} opt.count count the records instead of returning them
 * @param {Number} opt.neighbors the number of neighboring record levels to fetch
 */
const checkStandardOptions = (opt) => {
    const {
        limit, neighbors, skip, orderBy, orderByDirection, count, returnProperties, history,
    } = opt;

    const options = {};

    if (limit !== undefined && limit !== null) {
        options.limit = castRangeInt(limit, 1, MAX_LIMIT);
    }
    if (neighbors !== undefined) {
        options.neighbors = castRangeInt(neighbors, 0, MAX_NEIGHBORS);
    }
    if (skip !== undefined) {
        options.skip = castRangeInt(skip, 0);
    }
    if (orderBy) {
        if (Array.isArray(orderBy)) {
            options.orderBy = orderBy.map(prop => prop.trim());
        } else {
            options.orderBy = orderBy.split(',').map(prop => prop.trim());
        }
    }
    if (orderByDirection) {
        options.orderByDirection = `${orderByDirection}`.trim().toUpperCase();

        if (!['ASC', 'DESC'].includes(options.orderByDirection)) {
            throw new AttributeError(`Bad value (${options.orderByDirection}). orderByDirection must be one of ASC or DESC`);
        }
    }
    if (returnProperties) {
        options.returnProperties = Array.isArray(returnProperties)
            ? returnProperties
            : returnProperties.split(',');
    }
    if (history !== undefined) {
        options.history = castBoolean(history);
    }
    if (count) {
        options.count = castBoolean(count);
    }
    return { ...opt, ...options };
};


const displayQuery = ({ query: statement, params = {} }) => {
    let result = statement;

    for (const key of Object.keys(params)) {
        let value = params[key];

        if (typeof value === 'string') {
            value = `'${value}'`;
        } else if (value instanceof RID) {
            value = `#${value.cluster}:${value.position}`;
        }
        result = result.replace(new RegExp(`:${key}\\b`, 'g'), `${value}`);
    }
    return result;
};


module.exports = {
    castBoolean,
    castRangeInt,
    checkStandardOptions,
    displayQuery,
    getQueryableProps,
};
