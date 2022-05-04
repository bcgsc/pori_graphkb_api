const { ValidationError } = require('@bcgsc-pori/graphkb-schema');

const { OPERATORS, PARAM_PREFIX } = require('./constants');

const NUMBER_ONLY_OPERATORS = [OPERATORS.GT, OPERATORS.GTE, OPERATORS.LT, OPERATORS.LTE];

class Comparison {
    /**
     * @param {PropertyModel} prop the attribute being compared to
     * @param value the value to be compared to
     * @param {string} operator the operator to use for the comparison
     * @param {bool} negate if true then surround the comparison with a negation
     */
    constructor({
        name, prop, value, operator, negate = false, isLength = false,
    }) {
        this.name = name;
        this.prop = prop;
        this.value = value;
        this.operator = operator;
        this.negate = negate;
        this.isLength = isLength;
    }

    get valueIsIterable() {
        return this.value && (Array.isArray(this.value) || this.value.isSubquery);
    }

    /**
     * Use the properties and/or cast functions associated with the attr traversal
     * to format the values being compared to
     */
    validate() {
        const { prop, prop: { cast } } = this;

        const validateValue = (value) => {
            if (value !== null) {
                if (prop.choices && !prop.choices.includes(value)) {
                    throw new ValidationError(`Expect the property (${prop.name}) to be restricted to enum values but found: ${value}`);
                }
            }

            if (cast && value && !value.isSubquery) {
                return cast(value);
            }
            return value;
        };

        if (this.length && [...NUMBER_ONLY_OPERATORS, OPERATORS.EQ, OPERATORS.NE].includes(this.operator)) {
            throw new ValidationError('The length comparison can only be used with number values');
        }

        if (NUMBER_ONLY_OPERATORS.includes(this.operator)) {
            if (prop.iterable || this.valueIsIterable) {
                throw new ValidationError(
                    `Non-equality operator (${
                        this.operator
                    }) cannot be used in conjunction with an iterable property or value (${
                        prop.name
                    })`,
                );
            }
        } else if (this.operator === OPERATORS.IS) {
            if (this.value !== null) {
                throw new ValidationError(`IS operator (${
                    this.operator
                }) can only be used on prop (${
                    prop.name
                }) compared with null (${
                    this.value
                })`);
            }
        }

        if (this.operator === OPERATORS.CONTAINS && !prop.iterable) {
            throw new ValidationError(
                `CONTAINS can only be used with iterable properties (${
                    prop.name
                }). To check for a substring, use CONTAINSTEXT instead`,
            );
        }

        if (this.valueIsIterable) {
            if (this.operator === OPERATORS.CONTAINS) {
                throw new ValidationError(
                    `CONTAINS should be used with non-iterable values (${
                        prop.name
                    }). To compare two interables for intersecting values use CONTAINSANY or CONTAINSALL instead`,
                );
            }
            if (this.operator === OPERATORS.EQ && !prop.iterable) {
                throw new ValidationError(
                    `Using a direct comparison (${
                        this.operator
                    }) of a non-iterable property (${
                        prop.name
                    }) against a list or set`,
                );
            }
        } else if (this.operator === OPERATORS.IN) {
            throw new ValidationError('IN should only be used with iterable values');
        }

        // cast values and check types
        if (Array.isArray(this.value)) {
            for (let i = 0; i < this.value.length; i++) {
                if (this.value[i] !== null) {
                    this.value[i] = validateValue(this.value[i]);
                }
            }
        } else if (this.value !== null) {
            this.value = validateValue(this.value);
        } else if (this.operator !== OPERATORS.EQ && this.operator !== OPERATORS.IS) {
            throw new ValidationError(`Invalid operator (${this.operator}) used for NULL comparison`);
        }
    }

    /**
     * @param {int} [paramIndex=0] the number to append to parameter names
     * @param {bool} [listableType=false] indicates if the attribute being compared to is a set/list/bag/map etc.
     */
    buildSQL(initialParamIndex = 0) {
        const { name: attr } = this;
        let params = {},
            query,
            paramIndex = initialParamIndex;

        if (this.value && this.value.isSubquery) {
            const subquery = this.value.buildSQL(paramIndex);
            query = `${attr} ${this.operator} (${subquery.query})`;
            ({ params } = subquery);
        } else if (this.value instanceof Array || this.value instanceof Set) {
            for (const element of this.value) {
                const pname = `${PARAM_PREFIX}${paramIndex}`;
                paramIndex += 1;
                params[pname] = element;
            }

            if (this.operator === OPERATORS.EQ && this.prop.iterable) {
                const pname = `${PARAM_PREFIX}${paramIndex}`;
                paramIndex += 1;
                query = `(${attr} ${OPERATORS.CONTAINSALL} [${
                    Array.from(Object.keys(params), (p) => `:${p}`).join(', ')
                }] AND ${attr}.size() = :${pname})`;

                params[pname] = this.value.length;
            } else {
                query = `${attr} ${this.operator} [${
                    Array.from(Object.keys(params), (p) => `:${p}`).join(', ')
                }]`;
            }
        } else if (attr === '@this') {
            query = `${attr} ${this.operator} ${this.value}`;
        } else {
            const pname = `${PARAM_PREFIX}${paramIndex}`;

            if (this.value !== null) {
                params[pname] = this.value;

                if (this.isLength) {
                    query = `${attr}.size() ${this.operator} :${pname}`;
                } else {
                    query = `${attr} ${this.operator} :${pname}`;
                }
            } else {
                query = `${attr} ${OPERATORS.IS} NULL`;
            }
        }
        if (this.negate) {
            query = `NOT (${query})`;
        }
        return { params, query };
    }
}

class Clause {
    constructor(model, operator, filters) {
        this.model = model;
        this.operator = operator;
        this.filters = filters;
    }

    /**
     * @param {int} [initialParamIndex=0] the number to append to parameter names
     */
    buildSQL(initialParamIndex = 0, prefix = '') {
        const params = {};
        const components = [];
        let paramIndex = initialParamIndex;

        for (const comp of this.filters) {
            const result = comp.buildSQL(paramIndex, prefix);

            if (comp instanceof Clause && comp.filters.length > 1) {
                // wrap in brackets
                result.query = `(${result.query})`;
            }
            Object.assign(params, result.params);
            components.push(result.query);
            paramIndex = Object.values(params).length + initialParamIndex;
        }
        const query = components.join(` ${this.operator} `);
        return { params, query };
    }
}

class FixedSubquery {
    constructor(queryType, queryBuilder, opt = {}) {
        this.queryType = queryType;
        this.queryBuilder = queryBuilder;
        this.opt = opt;
        this.isSubquery = true;
    }

    expectedCount() { return null; }  // eslint-disable-line

    buildSQL(paramIndex = 0, prefix = '') {
        const query = this.queryBuilder({
            ...this.opt, paramIndex, prefix: prefix || this.opt.prefix,
        });
        return query;
    }
}

class Subquery {
    constructor({
        target, history, filters = null,
    }) {
        this.target = target;
        this.history = history;
        this.filters = filters;
        this.isSubquery = true;
    }

    expectedCount() {
        if (!this.filters && Array.isArray(this.target)) {
            return this.target.length;
        }
        return null;
    }

    buildSQL(paramIndex = 0, prefix = '') {
        const { filters, history, target } = this;
        let targetString = target,
            params = {};

        if (Array.isArray(target)) {
            targetString = `[${target.map((rid) => rid.toString()).join(', ')}]`;
        } else if (target.isSubquery) {
            const { query: subQuery, params: subParams } = target.buildSQL(paramIndex, prefix);
            paramIndex += Object.keys(subParams).length;
            targetString = `(${subQuery})`;
            Object.assign(params, subParams);
        }
        let statement = `SELECT * FROM ${targetString}`;

        if (filters && Object.keys(filters).length) {
            const { query: clause, params: filterParams } = filters.buildSQL(paramIndex, prefix);

            if (filters.isSubquery) {
                statement = `${statement} WHERE (${clause})`;
            } else {
                statement = `${statement} WHERE ${clause}`;
            }
            params = filterParams;
        }
        if (!history) {
            statement = `SELECT * FROM (${statement}) WHERE deletedAt IS NULL`;
        }

        return { params, query: statement };
    }
}

module.exports = {
    Clause, Comparison, FixedSubquery, Subquery,
};
