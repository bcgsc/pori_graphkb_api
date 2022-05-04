const { RecordID: RID } = require('orientjs');

const { ValidationError, schema, util } = require('@bcgsc-pori/graphkb-schema');

const { OPERATORS } = require('./constants');
const fixed = require('./fixed');
const { getQueryableProps } = require('./util');
const {
    Clause, Comparison, Subquery, FixedSubquery,
} = require('./fragment');

/**
* @param {string} modelName the starting model
* @param {object} opt the JSON representation to be parsed
*
* @returns {Comparison} the parsed object
*/
const parseComparison = (modelName, {
    operator: inputOperator, negate = false, ...rest
}) => {
    if (Object.keys(rest).length === 0) {
        throw new ValidationError('Missing the property name for the comparison');
    }
    let [name] = Object.keys(rest);
    const isLength = name.endsWith('.length');

    if (isLength) {
        name = name.slice(0, name.length - '.length'.length);
    }
    let value = rest[name];

    const properties = getQueryableProps(modelName);
    const prop = name === '@this'
        ? { choices: Object.values(schema.models).map((m) => m.name) }
        : properties[name];

    if (!prop) {
        throw new ValidationError(`The property (${name}) does not exist on the model (${modelName})`);
    }

    if (typeof value === 'object'
       && value !== null
       && !(value instanceof Array)
       && !(value instanceof RID)
    ) {
        if (value.queryType || value.filters) {
            value = parseSubquery(value);
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
        throw new ValidationError(
            `Invalid operator (${
                operator
            }). Must be one of (${
                Object.values(OPERATORS).join(', ')
            })`,
        );
    }

    if (name === '@this' && operator !== OPERATORS.INSTANCEOF) {
        throw new ValidationError(`Only the INSTANCEOF operator is valid to use with @this (${operator})`);
    }

    const result = new Comparison({
        isLength,
        name,
        negate,
        operator,
        prop,
        value,
    });
    result.validate();
    return result;
};

const parseClause = (modelName, content) => {
    if (Object.keys(content).length !== 1) {
        throw new ValidationError(`Filter clauses must be an object with a single AND or OR key. Found multiple keys (${Object.keys(content)})`);
    }
    const [operator] = Object.keys(content);

    if (!['AND', 'OR'].includes(operator)) {
        throw new ValidationError(`Filter clauses must be an object with a single AND or OR key. Found ${operator}`);
    }
    if (!Array.isArray(content[operator])) {
        throw new ValidationError('Expected filter clause value to be an array');
    }

    // clause may contain other clauses or direct comparisons
    const parsedFilters = [];

    for (const clause of content[operator]) {
        let parsed;

        try {
            parsed = parseClause(modelName, clause);
        } catch (err) {
            if (clause.OR || clause.AND) {
                throw err;
            }
            // direct property instead of a nested clause
            parsed = parseComparison(modelName, clause);
        }
        parsedFilters.push(parsed);
    }

    if (parsedFilters.length === 0) {
        throw new ValidationError('Clause must contain filters. Cannot be an empty array');
    }

    return new Clause(modelName, operator, parsedFilters);
};

const parseFixedQuery = ({ queryType, ...opt }) => {
    if (queryType === 'ancestors') {
        return new FixedSubquery(queryType, fixed.ancestors, opt);
    } if (queryType === 'descendants') {
        return new FixedSubquery(queryType, fixed.descendants, opt);
    } if (queryType === 'neighborhood') {
        return new FixedSubquery(queryType, fixed.neighborhood, opt);
    } if (queryType === 'similarTo') {
        return new FixedSubquery(queryType, fixed.similarTo, opt);
    } if (queryType === 'keyword') {
        return new FixedSubquery(queryType, fixed.keywordSearch, { ...opt, subQueryParser: parseSubquery });
    } if (queryType === 'edge') {
        return new FixedSubquery(queryType, fixed.edgeQuery, { ...opt, subQueryParser: parseSubquery });
    }
    throw new ValidationError(`Unrecognized query type (${queryType}) expected one of [ancestors, descendants, neighborhood, similarTo]`);
};

const parseSubquery = ({
    target: rawTarget,
    history = false,
    filters: rawFilters = null,
    queryType,
    model: inputModel,
    ...rest
}) => {
    let target = rawTarget,
        filters = null;

    if (Array.isArray(rawTarget)) {
        if (!rawTarget.length) {
            throw new ValidationError('target cannot be an empty array');
        }
        target = rawTarget.map(util.castToRID);
    } else if (typeof target !== 'string') {
        // fixed query. pre-parse the target and filters
        if (typeof rawTarget !== 'string') {
            target = parseSubquery(rawTarget);
        }
    }
    if (Object.keys(rest).length && !queryType) {
        throw new ValidationError(`Unrecognized query arguments: ${Object.keys(rest).join(',')}`);
    }

    if (rawFilters) {
        filters = rawFilters;

        if (Array.isArray(filters)) {
            filters = { AND: filters };
        } else if (!filters.AND && !filters.OR) {
            filters = { AND: [{ ...filters }] };
        }
    }

    let model = target.isSubquery
        ? null
        : schema.get(target, false);

    if (target.isSubquery && target.target && schema.has(target.target)) {
        model = schema.get(target.target);
    }

    if (!model && (!target || !target.isSubquery) && !Array.isArray(target)) {
        throw new ValidationError(`Invalid target class (${target})`);
    }

    if (model && model.isEdge && queryType !== 'edge' && filters && typeof target === 'string') {
        // stop the user from making very inefficient queries
        if (filters.AND.some((cond) => cond.out)) {
            target = parseFixedQuery({
                direction: 'out',
                queryType: 'edge',
                target: model.name,
                vertexFilter: filters.AND.find((cond) => cond.out).out,
            });
        } else if (filters.AND.some((cond) => cond.in)) {
            target = parseFixedQuery({
                direction: 'in',
                queryType: 'edge',
                target: model.name,
                vertexFilter: filters.AND.find((cond) => cond.in).in,
            });
        }
    }

    let defaultModel = schema.get(inputModel, false) || schema.models.V;

    if (target && target.queryType === 'edge') {
        defaultModel = schema.models.E;
    }
    if (filters) {
        filters = parseClause((model && model.name) || defaultModel.name, filters);
    }

    if (queryType) {
        if (!filters) {
            return parseFixedQuery({
                ...rest, history, queryType, target,
            }); // has to be passed to avoid circular dependency
        }
        return parseFixedQuery({
            ...rest, filters, history, queryType, target,
        }); // has to be passed to avoid circular dependency
    }
    return new Subquery({
        filters, history, target,
    });
};

module.exports = {
    parseClause, parseComparison, parseFixedQuery, parseSubquery,
};
