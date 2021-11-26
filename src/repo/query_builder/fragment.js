const { RecordID: RID } = require('orientjs');

const { error: { AttributeError }, schema: { schema }, util: { castToRID } } = require('@bcgsc-pori/graphkb-schema');

const { OPERATORS, PARAM_PREFIX } = require('./constants');
const { FixedSubquery } = require('./fixed');
const { getQueryableProps } = require('./util');

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
                    throw new AttributeError(`Expect the property (${prop.name}) to be restricted to enum values but found: ${value}`);
                }
            }

            if (cast && value && !value.isSubquery) {
                return cast(value);
            }
            return value;
        };

        if (this.length && [...NUMBER_ONLY_OPERATORS, OPERATORS.EQ, OPERATORS.NE].includes(this.operator)) {
            throw new AttributeError('The length comparison can only be used with number values');
        }

        if (NUMBER_ONLY_OPERATORS.includes(this.operator)) {
            if (prop.iterable || this.valueIsIterable) {
                throw new AttributeError(
                    `Non-equality operator (${
                        this.operator
                    }) cannot be used in conjunction with an iterable property or value (${
                        prop.name
                    })`,
                );
            }
        } else if (this.operator === OPERATORS.IS) {
            if (this.value !== null) {
                throw new AttributeError(`IS operator (${
                    this.operator
                }) can only be used on prop (${
                    prop.name
                }) compared with null (${
                    this.value
                })`);
            }
        }

        if (this.operator === OPERATORS.CONTAINS && !prop.iterable) {
            throw new AttributeError(
                `CONTAINS can only be used with iterable properties (${
                    prop.name
                }). To check for a substring, use CONTAINSTEXT instead`,
            );
        }

        if (this.valueIsIterable) {
            if (this.operator === OPERATORS.CONTAINS) {
                throw new AttributeError(
                    `CONTAINS should be used with non-iterable values (${
                        prop.name
                    }). To compare two interables for intersecting values use CONTAINSANY or CONTAINSALL instead`,
                );
            }
            if (this.operator === OPERATORS.EQ && !prop.iterable) {
                throw new AttributeError(
                    `Using a direct comparison (${
                        this.operator
                    }) of a non-iterable property (${
                        prop.name
                    }) against a list or set`,
                );
            }
        } else if (this.operator === OPERATORS.IN) {
            throw new AttributeError('IN should only be used with iterable values');
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
            throw new AttributeError(`Invalid operator (${this.operator}) used for NULL comparison`);
        }
    }

    /**
     * @param {ClassModel} model the starting model
     * @param {object} opt the JSON representation to be parsed
     *
     * @returns {Comparison} the parsed object
     */
    static parse(model, {
        operator: inputOperator, negate = false, ...rest
    }) {
        if (Object.keys(rest).length === 0) {
            throw new AttributeError('Missing the property name for the comparison');
        }
        let [name] = Object.keys(rest);
        const isLength = name.endsWith('.length');

        if (isLength) {
            name = name.slice(0, name.length - '.length'.length);
        }
        let value = rest[name];

        const properties = getQueryableProps(model);
        const prop = name === '@this'
            ? { choices: Object.values(schema).map((m) => m.name) }
            : properties[name];

        if (!prop) {
            throw new AttributeError(`The property (${name}) does not exist on the model (${model.name})`);
        }

        if (typeof value === 'object'
            && value !== null
            && !(value instanceof Array)
            && !(value instanceof RID)
        ) {
            if (value.queryType || value.filters) {
                value = Subquery.parse(value);
            }
        }

        let defaultOperator = OPERATORS.EQ;

        if (inputOperator === undefined) {
            if (prop.iterable) {
                if (Array.isArray(value)) {
                    defaultOperator = OPERATORS.EQ;
                } else if (value && value.isSubquery) {
                    defaultOperator = OPERATORS.CONTAINSANY;
                } else {
                    defaultOperator = OPERATORS.CONTAINS;
                }
            } else if (value && (Array.isArray(value) || value.isSubquery)) {
                defaultOperator = OPERATORS.IN;
            }
        }
        const operator = inputOperator || defaultOperator;

        if (!Object.values(OPERATORS).includes(operator) || operator === OPERATORS.OR || operator === OPERATORS.AND) {
            throw new AttributeError(
                `Invalid operator (${
                    operator
                }). Must be one of (${
                    Object.values(OPERATORS).join(', ')
                })`,
            );
        }

        if (name === '@this' && operator !== OPERATORS.INSTANCEOF) {
            throw new AttributeError(`Only the INSTANCEOF operator is valid to use with @this (${operator})`);
        }

        const result = new this({
            isLength,
            name,
            negate,
            operator,
            prop,
            value,
        });
        result.validate();
        return result;
    }

    /**
     * @param {int} [paramIndex=0] the number to append to parameter names
     * @param {bool} [listableType=false] indicates if the attribute being compared to is a set/list/bag/map etc.
     */
    toString(initialParamIndex = 0) {
        const { name: attr } = this;
        let params = {},
            query,
            paramIndex = initialParamIndex;

        if (this.value && this.value.isSubquery) {
            const subquery = this.value.toString(paramIndex);
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

    static parse(model, content) {
        if (Object.keys(content).length !== 1) {
            throw new AttributeError(`Filter clauses must be an object with a single AND or OR key. Found multiple keys (${Object.keys(content)})`);
        }
        const [operator] = Object.keys(content);

        if (!['AND', 'OR'].includes(operator)) {
            throw new AttributeError(`Filter clauses must be an object with a single AND or OR key. Found ${operator}`);
        }
        if (!Array.isArray(content[operator])) {
            throw new AttributeError('Expected filter clause value to be an array');
        }

        // clause may contain other clauses or direct comparisons
        const parsedFilters = [];

        for (const clause of content[operator]) {
            let parsed;

            try {
                parsed = this.parse(model, clause);
            } catch (err) {
                if (clause.OR || clause.AND) {
                    throw err;
                }
                // direct property instead of a nested clause
                parsed = Comparison.parse(model, clause);
            }
            parsedFilters.push(parsed);
        }

        if (parsedFilters.length === 0) {
            throw new AttributeError('Clause must contain filters. Cannot be an empty array');
        }

        return new this(model, operator, parsedFilters);
    }

    /**
     * @param {int} [initialParamIndex=0] the number to append to parameter names
     */
    toString(initialParamIndex = 0, prefix = '') {
        const params = {};
        const components = [];
        let paramIndex = initialParamIndex;

        for (const comp of this.filters) {
            const result = comp.toString(paramIndex, prefix);

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

    toString(paramIndex = 0, prefix = '') {
        const { filters, history, target } = this;
        let targetString = target,
            params = {};

        if (Array.isArray(target)) {
            targetString = `[${target.map((rid) => rid.toString()).join(', ')}]`;
        } else if (target.isSubquery) {
            const { query: subQuery, params: subParams } = target.toString(paramIndex, prefix);
            paramIndex += Object.keys(subParams).length;
            targetString = `(${subQuery})`;
            Object.assign(params, subParams);
        }
        let statement = `SELECT * FROM ${targetString}`;

        if (filters && Object.keys(filters).length) {
            const { query: clause, params: filterParams } = filters.toString(paramIndex, prefix);

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

    static parse({
        target: rawTarget,
        history = false,
        filters: rawFilters = null,
        queryType,
        model: inputModel,
        ...rest
    }) {
        let target = rawTarget,
            filters = null;

        if (Array.isArray(rawTarget)) {
            if (!rawTarget.length) {
                throw new AttributeError('target cannot be an empty array');
            }
            target = rawTarget.map(castToRID);
        } else if (typeof target !== 'string') {
            // fixed query. pre-parse the target and filters
            if (typeof rawTarget !== 'string') {
                target = this.parse(rawTarget);
            }
        }
        if (Object.keys(rest).length && !queryType) {
            throw new AttributeError(`Unrecognized query arguments: ${Object.keys(rest).join(',')}`);
        }

        if (rawFilters) {
            filters = rawFilters;

            if (Array.isArray(filters)) {
                filters = { AND: filters };
            } else if (!filters.AND && !filters.OR) {
                filters = { AND: [{ ...filters }] };
            }
        }

        let model = schema[target.isSubquery
            ? null
            : target
        ];

        if (target.isSubquery && target.target && schema[target.target]) {
            model = schema[target.target];
        }

        if (!model && (!target || !target.isSubquery) && !Array.isArray(target)) {
            throw new AttributeError(`Invalid target class (${target})`);
        }

        if (model && model.isEdge && queryType !== 'edge' && filters && typeof target === 'string') {
            // stop the user from making very inefficient queries
            if (filters.AND.some((cond) => cond.out)) {
                target = this.parse({
                    direction: 'out',
                    queryType: 'edge',
                    target: model.name,
                    vertexFilter: filters.AND.find((cond) => cond.out).out,
                });
            } else if (filters.AND.some((cond) => cond.in)) {
                target = this.parse({
                    direction: 'in',
                    queryType: 'edge',
                    target: model.name,
                    vertexFilter: filters.AND.find((cond) => cond.in).in,
                });
            }
        }

        let defaultModel = schema[inputModel] || schema.V;

        if (target && target.queryType === 'edge') {
            defaultModel = schema.E;
        }
        if (filters) {
            filters = Clause.parse(model || defaultModel, filters);
        }

        if (queryType) {
            if (!filters) {
                return FixedSubquery.parse({
                    ...rest, history, queryType, target,
                }, this.parse.bind(this)); // has to be passed to avoid circular dependency
            }
            return FixedSubquery.parse({
                ...rest, filters, history, queryType, target,
            }, this.parse.bind(this)); // has to be passed to avoid circular dependency
        }
        return new this({
            filters, history, target,
        });
    }
}

module.exports = { Subquery };
