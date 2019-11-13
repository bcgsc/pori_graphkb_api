const { RecordID: RID } = require('orientjs');
const {
    error: { AttributeError },
    util: { castInteger },
} = require('@bcgsc/knowledgebase-schema');
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
 * Given some depth level, calculates the nested projection required
 * to expand all associated links and edges
 */
const nestedProjection = (initialDepth, excludeHistory = true) => {
    const recursiveNestedProjection = (depth) => {
        let current = '*';

        if (depth !== initialDepth) {
            current = `${current}, @rid, @class`;

            if (excludeHistory) {
                current = `${current}, !history`;
            }
        }
        if (depth <= 0) {
            return current;
        }
        const inner = recursiveNestedProjection(depth - 1);
        return `${current}, *:{${inner}}`;
    };
    return recursiveNestedProjection(initialDepth);
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

/**
 * Convert a list of property names to a nested object representing the projection of
 * these properties. Validates the property list against the input model
 *
 * @param {ClassModel} model the model to validate the property list against
 * @param {Array.<string>} properties the list of properties to be parsed/validated
 * @param {boolean} allowDirectEmbedded flag to indicate if an error should be throw for embedded props without a subprop selection
 */
const parsePropertyList = (model, properties, allowDirectEmbedded = false) => {
    const projections = {};
    const propModels = getQueryableProps(model, allowDirectEmbedded);

    for (const prop of properties) {
        const [directProp] = prop.trim().split('.');
        const propModel = propModels[directProp];
        projections[directProp] = projections[directProp] || {};

        if (!propModel) {
            throw new AttributeError(`property ${directProp} does not exist or cannot be accessed on the model ${model.name}`);
        }

        const nestedProps = prop.trim().slice(directProp.length + 1);


        if (nestedProps) {
            if (!propModel.linkedClass) {
                throw new AttributeError(`Cannot return nested property (${prop}), the property (${propModel.name}) does not have a linked class`);
            }
            const innerProjection = parsePropertyList(propModel.linkedClass, [nestedProps]);
            projections[directProp] = { ...projections[directProp], ...innerProjection };
        }
    }
    return projections;
};


const propsToProjection = (model, properties, allowDirectEmbedded = false) => {
    const projection = parsePropertyList(model, properties, allowDirectEmbedded);

    const convertToString = (obj) => {
        const keyList = [];

        for (const [key, value] of Object.entries(obj)) {
            if (Object.keys(value).length) {
                keyList.push(`${key}:{ ${convertToString(value)} }`);
            } else {
                keyList.push(key);
            }
        }
        return keyList.join(', ');
    };
    return convertToString(projection);
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
    checkStandardOptions,
    propsToProjection,
    parsePropertyList,
    displayQuery,
    getQueryableProps,
    nestedProjection,
    castBoolean,
    castRangeInt,
};
