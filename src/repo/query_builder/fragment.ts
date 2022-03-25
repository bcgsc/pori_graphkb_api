import {
    displayQuery,
} from './util';
import * as gkbSchema from '@bcgsc-pori/graphkb-schema';
const { error: { AttributeError } } = gkbSchema;
import {isObj, isSubquery, QueryElement, QueryBase, isControlledValue, BuiltQuery} from '../../types';
import { OPERATORS, PARAM_PREFIX } from './constants';

const NUMBER_ONLY_OPERATORS = [OPERATORS.GT, OPERATORS.GTE, OPERATORS.LT, OPERATORS.LTE];

class Comparison implements QueryElement {
    name: string;
    prop: gkbSchema.Property;
    value: unknown;
    operator: string;
    negate: boolean;
    isLength: boolean;

    /**
     * @param {PropertyModel} prop the attribute being compared to
     * @param value the value to be compared to
     * @param {string} operator the operator to use for the comparison
     * @param {bool} negate if true then surround the comparison with a negation
     */
    constructor({
        name, prop, value, operator, negate, isLength,
    }) {
        this.name = name;
        this.prop = prop;
        this.value = value;
        this.operator = operator || OPERATORS.EQ;
        this.negate = Boolean(negate);
        this.isLength = Boolean(isLength);
    }

    get valueIsIterable() {
        return this.value && (Array.isArray(this.value) || (isObj(this.value) && this.value.isSubquery));
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

        if (this.isLength && isControlledValue(this.operator, [...NUMBER_ONLY_OPERATORS, OPERATORS.EQ])) {
            throw new AttributeError('The length comparison can only be used with number values');
        }

        if (isControlledValue(this.operator, NUMBER_ONLY_OPERATORS)) {
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
     * @param {int} [paramIndex=0] the number to append to parameter names
     * @param {bool} [listableType=false] indicates if the attribute being compared to is a set/list/bag/map etc.
     */
    toString(initialParamIndex = 0) {
        const { name: attr } = this;
        let params = {},
            query,
            paramIndex = initialParamIndex;

        if (isSubquery(this.value)) {
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

                params[pname] = Array.isArray(this.value)
                    ? this.value.length
                    : this.value.size;
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

class Clause implements QueryElement {
    readonly model: string;
    readonly operator: 'AND' | 'OR';
    filters: Array<Clause | Comparison>;

    constructor(model: string, operator: 'AND' | 'OR', filters: Array<Clause | Comparison>) {
        this.model = model;
        this.operator = operator;
        this.filters = filters;
    }

    /**
     * @param {int} [initialParamIndex=0] the number to append to parameter names
     */
    toString(initialParamIndex = 0, prefix = '') {
        const params = {};
        const components: string[] = [];
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

class Subquery extends QueryBase {
    readonly target: unknown;
    readonly history: boolean;
    readonly filters: Clause | null;
    readonly isSubquery: true;
    readonly queryType?: undefined;

    constructor({
        target, history, filters = null,
    }: {target: unknown; history?: unknown; filters?: Clause | null}) {
        super();
        this.target = target;
        this.history = Boolean(history);
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
        } else if (isSubquery(target)) {
            const { query: subQuery, params: subParams } = target.toString(paramIndex, prefix);
            paramIndex += Object.keys(subParams).length;
            targetString = `(${subQuery})`;
            Object.assign(params, subParams);
        }
        let statement = `SELECT * FROM ${targetString}`;

        if (filters && Object.keys(filters).length) {
            const { query: clause, params: filterParams } = filters.toString(paramIndex, prefix);

            if (isSubquery(filters)) {
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

class WrapperQuery extends QueryBase {
    isSubquery: false;
    readonly limit?: number;
    readonly skip?: number;
    readonly projection?: string;
    query: QueryBase;
    target: unknown;
    readonly orderBy?: string[];
    readonly orderByDirection?: 'ASC' | 'DESC';
    readonly count: boolean;
    readonly history: boolean;
    queryType?: undefined;

    constructor({
        target, limit, skip, projection, query, orderByDirection, orderBy, count = false, history = false,
    }) {
        super();
        this.target = target;
        this.limit = limit;
        this.skip = skip;
        this.projection = projection;
        this.query = query;
        this.orderBy = orderBy;
        this.orderByDirection = orderByDirection;
        this.count = count;
        this.history = history;
        this.isSubquery = false;
    }

    expectedCount() {
        if (!this.count && this.query.expectedCount() && !this.skip) {
            let count = this.query.expectedCount();

            if (this.limit !== null && this.limit !== undefined && count !== null) {
                count = Math.min(this.limit, count);
            }
            return count;
        }
        return null;
    }

    toString() {
        const {
            skip, limit, projection, count, orderByDirection, orderBy,
        } = this;
        const { query, params } = this.query.toString(0);

        if (!count && !orderBy && !skip && limit === undefined) {
            // don't need to wrap since there are no modificiations
            return { params, query };
        }

        let statement = query;

        if (count) {
            statement = `SELECT count(*) AS count FROM (${query})`;
        } else if (projection !== '*') {
            statement = `SELECT ${projection} FROM (${query})`;
        }

        if (!count) {
            if (orderBy) {
                const direction = orderByDirection || 'ASC';
                const ordering = orderBy.map((p) => `${p} ${direction}`);
                statement = `${statement} ORDER BY ${ordering.join(', ')}`;
            }
            if (skip) {
                statement = `${statement} SKIP ${skip}`;
            }
            if (limit !== undefined && limit !== null) {
                statement = `${statement} LIMIT ${limit}`;
            }
        }
        return { params, query: statement };
    }

    displayString() {
        return displayQuery(this.toString());
    }
}

export { Subquery, WrapperQuery, Clause, Comparison };
