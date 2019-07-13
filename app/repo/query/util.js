const {
    error: {AttributeError},
    util: {castInteger}
} = require('@bcgsc/knowledgebase-schema');


const {TRAVERSAL_TYPE} = require('./constants');


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
 * @param {string} compoundAttr the shorthand attr notation
 *
 * @returns {Object} the query JSON attr representation
 */
const parseCompoundAttr = (compoundAttr) => {
    const attrs = compoundAttr.split('.');
    const expanded = {};
    let curr = expanded;

    for (const attr of attrs) {
        if (curr.type === undefined) {
            curr.type = TRAVERSAL_TYPE.LINK;
        }
        const match = /^(in|out|both)(E?(\(([^)]*)\))|E)$/.exec(attr);
        if (match) {
            const [, direction, , , edges] = match;
            curr.child = {
                type: TRAVERSAL_TYPE.EDGE,
                direction
            };
            if (edges !== undefined) {
                curr.child.edges = edges.trim().length > 0
                    ? Array.from(edges.split(','), e => e.trim())
                    : [];
            }
        } else if (attr === 'vertex') {
            if (curr.type !== TRAVERSAL_TYPE.EDGE) {
                throw new AttributeError('vertex may only follow an edge traversal');
            }
            curr.child = {};
            if (curr.direction === 'out') {
                curr.child.attr = 'inV';
            } else if (curr.direction === 'in') {
                curr.child.attr = 'outV';
            } else {
                curr.child.attr = 'bothV';
            }
        } else {
            curr.child = {attr};
        }
        curr = curr.child;
    }
    return expanded.child;
};

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


const generateSqlParams = (items, paramStart) => {
    const params = {};
    for (let i = 0; i < items.length; i++) {
        const paramName = `param${paramStart + Object.keys(params).length}`;
        params[paramName] = items[i];
    }
    return params;
};


const reverseDirection = direction => (direction === 'out'
    ? 'in'
    : 'out');


module.exports = {
    parseCompoundAttr, castRangeInt, castBoolean, generateSqlParams, nestedProjection, reverseDirection
};
