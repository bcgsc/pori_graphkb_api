const {RecordID: RID} = require('orientjs');

const {error: {AttributeError}} = require('@bcgsc/knowledgebase-schema');

const match = require('./match');
const {
    PARAM_PREFIX, OPERATORS, MAX_LIMIT, MAX_NEIGHBORS
} = require('./constants');
const {castRangeInt, castBoolean, nestedProjection} = require('./util');
const {Traversal} = require('./traversal');


class Comparison {
    /**
     * @param {string|Traversal} attr the attribute being compared to
     * @param value the value to be compared to
     * @param {string} operator the operator to use for the comparison
     * @param {bool} negate if true then surround the comparison with a negation
     */
    constructor(attr, value, operator, negate = false) {
        this.attr = attr;
        if (!(this.attr instanceof Traversal)) {
            this.attr = new Traversal(this.attr);
        }
        if (operator === undefined) {
            const prop = this.attr.terminalProperty();
            if (!(value instanceof Array)) {
                if ((prop && prop.iterable) || this.attr.iterable()) {
                    operator = OPERATORS.CONTAINS;
                }
            }
        }
        this.value = value;
        this.operator = (operator || OPERATORS.EQ).toUpperCase();
        this.negate = negate;
        if (!Object.values(OPERATORS).includes(this.operator) || this.operator === OPERATORS.OR || this.operator === OPERATORS.AND) {
            throw new AttributeError(
                `Invalid operator (${
                    operator
                }). Must be one of (${
                    Object.values(OPERATORS).join(', ')
                })`
            );
        }
    }

    /**
     * @param {object.<string,ClassModel>} schema the mapping of class names to models
     * @param {ClassModel} model the starting model
     * @param {object} opt the JSON representation to be parsed
     *
     * @returns {Comparison} the parsed object
     */
    static parse(schema, model, opt) {
        const {
            attr, value, operator, negate = false
        } = opt;

        const parsedAttr = Traversal.parse(schema, model, attr);

        if (typeof value === 'object'
            && value !== null
            && !(value instanceof Array)
            && !(value instanceof RID)
        ) {
            if (value.class) {
                // must be a Query.
                const subModel = schema[value.class] || model;
                const subquery = Query.parse(schema, subModel, {...value, limit: null, skip: null}); // cannot paginate subqueries
                return new this(parsedAttr, subquery, operator, negate);
            }
            throw new AttributeError('Value for a comparison must be a primitive value or a subquery. Subqueries must contains the `class` attribute');
        }
        return new this(parsedAttr, value, operator, negate);
    }

    /**
     * Use the properties and/or cast functions associated with the attr traversal
     * to format the values being compared to
     */
    validate() {
        let cast = this.attr.terminalCast();
        const prop = this.attr.terminalProperty();

        if (prop && prop.cast) {
            ({cast} = prop);
        }

        const validateValue = (value) => {
            if (prop) {
                if (value !== null) {
                    if (prop.choices && !prop.choices.includes(value)) {
                        throw new AttributeError(`Expect the property (${prop.name}) to be restricted to enum values but found: ${value}`);
                    }
                }
            }
            if (cast && !(value instanceof Query)) {
                return cast(value);
            }
            return value;
        };

        if (prop) {
            if ([OPERATORS.GT, OPERATORS.GTE, OPERATORS.LT, OPERATORS.LTE].includes(this.operator)) {
                if (prop.iterable) {
                    throw new AttributeError(
                        `Non-equality operator (${
                            this.operator
                        }) cannot be used in conjunction with an iterable property (${
                            prop.name
                        })`
                    );
                }
            }
        }

        if (this.value instanceof Query) {
            this.value.validate();
        } else if (this.value instanceof Array) {
            for (let i = 0; i < this.value.length; i++) {
                if (this.value[i] !== null) {
                    this.value[i] = validateValue(this.value[i]);
                }
            }
            if (prop) {
                if (this.operator === OPERATORS.EQ && !prop.iterable && !this.attr.iterable()) {
                    throw new AttributeError(
                        `Using a direct comparison (${
                            this.operator
                        }) of a non-iterable property (${
                            prop.name
                        }) against a list or set`
                    );
                } if (this.operator === OPERATORS.CONTAINS) {
                    throw new AttributeError(
                        `CONTAINS should be used with non-iterable values (${
                            prop.name
                        }). To compare two interables for intersecting values use IN instead`
                    );
                }
            }
        } else if (this.value !== null) {
            this.value = validateValue(this.value);

            if (this.operator === OPERATORS.CONTAINS) {
                if (prop && !prop.iterable && !this.attr.iterable()) {
                    throw new AttributeError(
                        `CONTAINS can only be used with iterable properties (${
                            prop.name
                        }). To check for a substring, use CONTAINSTEXT instead`
                    );
                }
            } if (this.operator === OPERATORS.IN) {
                throw new AttributeError('IN should only be used with iterable values');
            } if (this.operator === OPERATORS.EQ) {
                if (prop && (prop.iterable || this.attr.iterable())) {
                    throw new AttributeError(
                        `A direct comparison (${
                            this.operator
                        }) to an iterable property (${
                            prop.name
                        }) must be against an iterable value (${
                            this.value
                        })`
                    );
                }
            }
        } else if (this.operator !== OPERATORS.EQ && this.operator !== OPERATORS.IS) {
            throw new AttributeError(`Invalid operator (${this.operator}) used for NULL comparison`);
        }
    }

    /**
     * @param {int} [paramIndex=0] the number to append to parameter names
     * @param {bool} [listableType=false] indicates if the attribute being compared to is a set/list/bag/map etc.
     */
    toString(paramIndex = 0) {
        const params = {};
        let query,
            cast = this.attr.terminalCast();
        const prop = this.attr.terminalProperty();

        if (prop && prop.cast) {
            ({cast} = prop);
        }
        const attr = this.attr.toString();
        if (this.value instanceof Query) {
            const {query: subQuery, params: subParams} = this.value.toString(paramIndex);
            query = `${attr} IN (${subQuery})`;
            Object.assign(params, subParams);
        } else if (this.value instanceof Array || this.value instanceof Set) {
            for (const element of this.value) {
                const pname = `${PARAM_PREFIX}${paramIndex++}`;
                params[pname] = element;
            }
            query = `${attr} ${this.operator} [${
                Array.from(Object.keys(params), p => `:${p}`).join(', ')
            }]`;
        } else {
            const pname = `${PARAM_PREFIX}${paramIndex}`;
            if (this.value !== null) {
                params[pname] = cast
                    ? cast(this.value)
                    : this.value;
                query = `${attr} ${this.operator} :${pname}`;
            } else {
                query = `${attr} ${OPERATORS.IS} NULL`;
            }
        }
        if (this.negate) {
            query = `NOT (${query})`;
        }
        return {query, params};
    }
}


class Query {
    /**
     * Builds the query statement for selecting or matching records from the database
     *
     * @param {string} modelName the model to be selected from
     * @param {?Clause} where object of property names linked to values, comparisons, or clauses
     * @param {Object} opt Selection options
     * @param {Array.<string>} [opt.returnProperties] list of property names to return from the selection (instead of full records)
     * @param {Number} [opt.skip] skip the first N records
     * @param {Number} [opt.limit] limit the return to N records
     * @param {string} [opt.type] the type of pre-fabricated query (should match an export name in the match module)
     * @param {boolean} [opt.activeOnly=true] select only non-deleted records
     * @param {Number} [opt.neighbors] select records N jumps away from the resulting selection of records (fetch)
     * @param {Array.<string>} [opt.orderBy] list of property names to use in ordering the results
     * @param {string} [opt.orderByDirection='ASC'] ordering direction, either DESC or ASC
     *
     */
    constructor(modelName, where, opt = {}) {
        const {
            limit = MAX_LIMIT,
            neighbors = 0,
            orderBy = null,
            orderByDirection = 'ASC',
            projection = null,
            activeOnly = true,
            skip = null,
            count = false,
            edges = []
        } = opt;
        this.modelName = modelName;
        this.where = where || new Clause(OPERATORS.AND); // conditions that make up the terms of the query
        this.skip = skip;
        this.type = match[opt.type] || null;
        this.projection = projection;
        this.neighbors = neighbors;
        this.limit = limit;
        this.activeOnly = activeOnly;
        this.orderBy = orderBy;
        this.orderByDirection = orderByDirection;
        this.count = count;
        this.edges = edges;
    }

    /**
     * Given some node class, create a SelectionQuery to build select statements to find items
     * in the db
     *
     * @param {Object.<string,ClassModel>} schema the set of models avaiable for build queries from
     * @param {ClassModel} currModel the current model
     * @param {Object} opt options
     * @param {?Number} [opt.skip=null] number of records to skip
     * @param {boolean} [opt.activeOnly=true] select only active records
     * @param {?Array.<string>} [opt.returnProperties=null] the list of properties to return
     * @param {string} [opt.defaultOperator='='] the default operator to be used for subsequent comparisons
     */
    static parse(schema, model, opt = {}) {
        const {
            skip = null,
            activeOnly = true,
            returnProperties = null,
            orderBy = null,
            orderByDirection = 'ASC',
            limit = MAX_LIMIT,
            count = false,
            neighbors = 0,
            type = null,
            edges = [],
            depth = null
        } = opt;

        let where = [];
        if (opt.where) {
            where = !(opt.where instanceof Array)
                ? [opt.where]
                : opt.where;
        }
        let projection = null;
        if (returnProperties) {
            projection = returnProperties.join(', ');
        }

        if (!['ASC', 'DESC'].includes(orderByDirection)) {
            throw new AttributeError(`orderByDirection must be ASC or DESC not ${orderByDirection}`);
        }

        const schemaMap = {};
        for (const currModel of Object.values(schema)) {
            schemaMap[currModel.name.toLowerCase()] = currModel;
        }

        const conditions = new Clause(OPERATORS.AND);


        for (const condition of where) {
            // condition must be a Clause or a Comparison
            if (condition.comparisons !== undefined || condition.attr === undefined) {
                // clause
                conditions.push(Clause.parse(schema, model, condition));
            } else {
                // comparison
                conditions.push(Comparison.parse(schema, model, condition));
            }
        }
        const properties = model.queryProperties;

        // can only return properties or order by properties which belong to this class
        for (const propName of (returnProperties || []).concat(orderBy || [])) {
            const [prefix] = propName.split('.');
            if (properties[propName] === undefined && properties[prefix] === undefined) {
                throw new AttributeError(
                    `invalid return/ordering property '${
                        propName
                    }' is not a valid member of class '${
                        model.name
                    }'`
                );
            }
        }

        return new this(model.name, conditions, {
            skip,
            activeOnly,
            projection,
            orderBy,
            orderByDirection,
            limit: limit === null
                ? limit
                : castRangeInt(limit, 1, MAX_LIMIT),
            neighbors: castRangeInt(neighbors, 0, MAX_NEIGHBORS),
            type,
            edges,
            depth,
            count: castBoolean(count)
        });
    }

    /**
     * Given the contents of a record, create a query to select it from the DB
     */
    static parseRecord(schema, model, rawContent = {}, opt = {}) {
        const {ignoreMissing = true, ...rest} = opt;
        const where = [];
        const {properties} = model;

        const content = model.formatRecord(rawContent, {addDefaults: false, ignoreMissing: true});

        for (const [key, value] of Object.entries(content || {})) {
            const prop = properties[key];
            if (!prop) {
                throw new AttributeError(`property (${key}) does not exist on this model (${model.name})`);
            }
            if (prop.iterable) {
                where.push({attr: key, value: prop.validate(value), operator: 'CONTAINSALL'});
                where.push({attr: `${key}.size()`, value: value.length});
            } else {
                where.push({attr: key, value: prop.validate(value)});
            }
        }
        if (!ignoreMissing) {
            for (const propName of (model.getActiveProperties() || []).sort()) {
                if (propName === 'deletedAt') {
                    continue; // taken care of by activeOnly property
                }
                const prop = properties[propName];
                if (content[propName] === undefined) {
                    if (prop.iterable) {
                        where.push({attr: `${propName}.size()`, value: 0});
                    } else {
                        where.push({attr: propName, value: null});
                    }
                }
            }
        }
        return this.parse(schema, model, {...rest, where});
    }

    /**
     * Apply cast functions where appropriate to input parameters
     */
    validate() {
        this.where.validate();
    }

    /**
     * print the selection query as a string with SQL paramters.
     *
     * @param {int} paramStartIndex
     *
     * @returns {Object} an object containing the SQL query statment (query) and the parameters (params)
     */
    toString(paramIndex = 0) {
        const selectionElements = this.projection || nestedProjection(this.neighbors, !this.activeOnly);

        let queryString,
            params;

        if (this.type) {
            const {query, params: subParams} = this.type({
                whereClause: this.where,
                modelName: this.modelName,
                edges: this.edges,
                depth: this.depth,
                paramIndex
            });
            queryString = query;
            params = subParams;
            if (this.activeOnly) {
                queryString = `SELECT * FROM (${queryString}) WHERE deletedAt IS NULL`; // Fix for indexing error in OrientDB v2
            }
        } else {
            const {query, params: subParams} = this.where.toString(paramIndex);
            params = subParams;
            queryString = `SELECT ${selectionElements} FROM ${this.modelName}`;
            if (query) {
                queryString = `${queryString} WHERE ${query}`;
                if (this.activeOnly) {
                    queryString = `SELECT * FROM (${queryString}) WHERE deletedAt IS NULL`; // Fix for indexing error in OrientDB v2
                }
            } else if (this.activeOnly) {
                queryString = `${queryString} WHERE deletedAt IS NULL`; // Fix for indexing error in OrientDB v2
            }
        }
        if (this.orderBy && this.orderBy.length > 0) {
            queryString = `${queryString} ORDER BY ${this.orderBy.map(param => `${param} ${this.orderByDirection}`).join(', ')}`;
        }
        if (this.count) {
            queryString = `SELECT count(*) as count FROM (${queryString})`;
        } else if (this.skip != null) {
            queryString = `${queryString} SKIP ${this.skip}`;
        }
        if (this.limit !== null) {
            queryString = `${queryString} LIMIT ${this.limit}`;
        }
        return {query: queryString, params};
    }

    /**
     * Returns the query as a string but substitutes all parameters to make the results more
     * readable.
     *
     * @warning
     *      use the toString and params to query the db. This method is for VERBOSE/logging only
     */
    static displayString(queryObj) {
        let {query: statement, params} = queryObj.toString();
        for (const key of Object.keys(params)) {
            let value = params[key];
            if (typeof value === 'string') {
                value = `'${value}'`;
            } else if (value instanceof RID) {
                value = `#${value.cluster}:${value.position}`;
            }
            statement = statement.replace(new RegExp(`:${key}\\b`, 'g'), `${value}`);
        }
        return statement;
    }

    displayString() {
        return this.constructor.displayString(this);
    }
}


class Clause {
    /**
     * @param {string} type can be OR or AND
     * @param {Array.<(Comparison|Clause)>} comparisons the array of comparisons (or clauses) which make up the clause
     */
    constructor(type = OPERATORS.OR, comparisons = []) {
        this.type = type;
        this.comparisons = comparisons;
    }

    /**
     * @param {object.<string,ClassModel>} schema the mapping of class names to models
     * @param {ClassModel} model the starting model
     * @param {object} opt the JSON representation to be parsed
     * @param {Array.<object>} opt.comparisons the list of comparisons in this clause
     * @param {string} opt.operator the operator of the clause (AND, OR)
     *
     * @returns {Clause} the parsed object
     */
    static parse(schema, model, opt) {
        const {comparisons, operator} = opt;
        const parsed = [];
        for (const comparison of comparisons) {
            if (comparison.attr !== undefined) {
                // Comparison
                parsed.push(Comparison.parse(schema, model, comparison));
            } else {
                parsed.push(this.parse(schema, model, comparison));
            }
        }
        return new this(operator, parsed);
    }

    /**
     * Add an item to the list of comparisons
     * @param {Comparison|Clause} item item to be added
     */
    push(item) {
        this.comparisons.push(item);
    }

    get length() {
        return this.comparisons.length;
    }

    /**
     * Recursively apply the case function to all comarison values
     * @param {Function} cast the cast function to be applied
     */
    validate() {
        for (const item of this.comparisons) {
            item.validate();
        }
    }

    /**
     * @param {int} [paramIndex=0] the number to append to parameter names
     * @param {bool} [listableType=false] indicates if the attribute being compared to is a set/list/bag/map etc.
     */
    toString(paramIndex = 0, listableType = false) {
        const params = {};
        const components = [];
        for (const comp of this.comparisons) {
            const result = comp.toString(
                paramIndex,
                listableType
            );
            if (comp instanceof Clause && comp.length > 1) {
                // wrap in brackets
                result.query = `(${result.query})`;
            }
            Object.assign(params, result.params);
            components.push(result.query);
            paramIndex = Object.values(params).length;
        }
        const query = components.join(` ${this.type} `);
        return {query, params};
    }
}


module.exports = {
    Query, Comparison, Clause, nestedProjection
};
