import orientjs from 'orientjs';
import * as gkbSchema from '@bcgsc-pori/graphkb-schema';
import * as fixed from './fixed';
import {Clause, Comparison, Subquery, WrapperQuery} from './fragment';
import { checkStandardOptions, getQueryableProps } from './util';
import { OPERATORS, MAX_LIMIT } from './constants';
import {propsToProjection, nestedProjection, nonSpecificProjection} from './projection';
import { isControlledValue, isObj, isSubquery } from '../../types';

const { error: { AttributeError }, schema, util: { castToRID } } = gkbSchema;


const parseFixedSubquery = ({ queryType, ...opt }, subQueryParser) => {
    if (queryType === 'ancestors') {
        return new fixed.FixedSubquery(queryType, fixed.ancestors, opt);
    } if (queryType === 'descendants') {
        return new fixed.FixedSubquery(queryType, fixed.descendants, opt);
    } if (queryType === 'neighborhood') {
        return new fixed.FixedSubquery(queryType, fixed.neighborhood, opt);
    } if (queryType === 'similarTo') {
        return new fixed.FixedSubquery(queryType, fixed.similarTo, opt);
    } if (queryType === 'keyword') {
        return new fixed.FixedSubquery(queryType, fixed.keywordSearch, { ...opt, subQueryParser });
    } if (queryType === 'edge') {
        return new fixed.FixedSubquery(queryType, fixed.edgeQuery, { ...opt, subQueryParser });
    }
    throw new AttributeError(`Unrecognized query type (${queryType}) expected one of [ancestors, descendants, neighborhood, similarTo]`);
};


/**
* @param {ClassModel} model the starting model
* @param {object} opt the JSON representation to be parsed
*
* @returns {Comparison} the parsed object
*/
const parseComparison = (model, {
    operator: inputOperator, negate = false, ...rest
}: Record<string,unknown>) => {
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
        ? { choices: Object.values(schema.models).map((m) => m.name), iterable: false }
        : properties[name];

    if (!prop) {
        throw new AttributeError(`The property (${name}) does not exist on the model (${model.name})`);
    }

    if (isObj(value)
        && !(value instanceof orientjs.RID)
    ) {
        const objValue = value as Record<string,unknown>;
        if (objValue.queryType || objValue.filters) {
            value = parseSubquery(objValue);
        }
    }

    let defaultOperator: string = OPERATORS.EQ;

    if (inputOperator === undefined) {
        if (prop.iterable) {
            if (Array.isArray(value)) {
                defaultOperator = OPERATORS.EQ;
            } else if (isSubquery(value)) {
                defaultOperator = OPERATORS.CONTAINSANY;
            } else {
                defaultOperator = OPERATORS.CONTAINS;
            }
        } else if (value && (Array.isArray(value) || isSubquery(value))) {
            defaultOperator = OPERATORS.IN;
        }
    }
    const operator = inputOperator || defaultOperator;

    if (!isControlledValue(operator, OPERATORS) || operator === OPERATORS.OR || operator === OPERATORS.AND) {
        throw new AttributeError(
            `Invalid operator (${operator
            }). Must be one of (${Object.values(OPERATORS).join(', ')
            })`,
        );
    }

    if (name === '@this' && operator !== OPERATORS.INSTANCEOF) {
        throw new AttributeError(`Only the INSTANCEOF operator is valid to use with @this (${operator})`);
    }

    const result = new Comparison({
        isLength,
        name,
        negate: Boolean(negate),
        operator,
        prop,
        value,
    });
    result.validate();
    return result;
};

const parseClause = (model: string, content: Record<string,unknown>) => {
    if (Object.keys(content).length !== 1) {
        throw new AttributeError(`Filter clauses must be an object with a single AND or OR key. Found multiple keys (${Object.keys(content)})`);
    }
    const [operator] = Object.keys(content);

    if (!isControlledValue(operator, ['AND', 'OR'])) {
        throw new AttributeError(`Filter clauses must be an object with a single AND or OR key. Found ${operator}`);
    }
    if (!Array.isArray(content[operator])) {
        throw new AttributeError('Expected filter clause value to be an array');
    }

    // clause may contain other clauses or direct comparisons
    const parsedFilters: Array<Clause |Comparison> = [];

    if (!Array.isArray(content[operator])) {
        throw new AttributeError(`Filter clause is malformed. Value of AND/OR operators must be an array`)
    }

    for (const clause of content[operator] as unknown[]) {
        let parsed;

        if (!isObj(clause)) {
            throw new AttributeError('Element of filter clause is malformed. Expected an object');
        }
        try {
            parsed = parseClause(model, clause);
        } catch (err) {
            if (clause.OR || clause.AND) {
                throw err;
            }
            // direct property instead of a nested clause
            parsed = parseComparison(model, clause);
        }
        parsedFilters.push(parsed);
    }

    if (parsedFilters.length === 0) {
        throw new AttributeError('Clause must contain filters. Cannot be an empty array');
    }

    return new Clause(model, operator as 'AND' | 'OR', parsedFilters);
};

const parseSubquery = ({
    target: rawTarget,
    history = false,
    filters: rawFilters = null,
    queryType,
    model: inputModel,
    ...rest
}: Record<string,unknown>) => {
    let target;

    if (Array.isArray(rawTarget)) {
        if (!rawTarget.length) {
            throw new AttributeError('target cannot be an empty array');
        }
        target = rawTarget.map(castToRID);
    } else if (typeof rawTarget !== 'string' && typeof rawTarget === 'object' && rawTarget !== null) {
        // fixed query. pre-parse the target and filters
        target = parseSubquery(rawTarget as Record<string,unknown>);
    } else {
        target = rawTarget;
    }
    if (Object.keys(rest).length && !queryType) {
        throw new AttributeError(`Unrecognized query arguments: ${Object.keys(rest).join(',')}`);
    }

    let defaultModel = schema.has(inputModel)
        ? inputModel
        : 'V';

    if (target && target.queryType === 'edge') {
        defaultModel = 'E';
    }

    const model = (
        target.isSubquery
        ? null
        : target
    ) || defaultModel;

    let filters: Clause | undefined;

    if (rawFilters) {
        if (!isObj(rawFilters)) {
            throw new AttributeError('Filters must be a clause object or an array')
        }
        if (Array.isArray(rawFilters)) {
            filters = parseClause(model, { AND: rawFilters });;
        } else if (!rawFilters.AND && !rawFilters.OR) {
            filters = parseClause(model, { AND: [{ ...rawFilters }] });
        } else {
            filters = parseClause(model, rawFilters);
        }
    }

    if (!model && (!target || !target.isSubquery) && !Array.isArray(target)) {
        throw new AttributeError(`Invalid target class (${target})`);
    }

    if (model && model.isEdge && queryType !== 'edge' && isObj(filters) && typeof target === 'string' && Array.isArray(filters.AND)) {
        // stop the user from making very inefficient queries

        if (filters.AND.some((cond) => cond.out)) {
            target = parseSubquery({
                direction: 'out',
                queryType: 'edge',
                target: model.name,
                vertexFilter: filters.AND.find((cond) => cond.out).out,
            });
        } else if (filters.AND.some((cond) => cond.in)) {
            target = parseSubquery({
                direction: 'in',
                queryType: 'edge',
                target: model.name,
                vertexFilter: filters.AND.find((cond) => cond.in).in,
            });
        }
    }


    if (queryType) {
        if (!filters) {
            return parseFixedSubquery({
                ...rest, history, queryType, target,
            }, parseSubquery); // has to be passed to avoid circular dependency
        }
        return parseFixedSubquery({
            ...rest, filters, history, queryType, target,
        }, parseSubquery); // has to be passed to avoid circular dependency
    }
    return new Subquery({
        filters, history, target,
    });
};


const parse = (opt) => {
    const {
        target,
        limit = MAX_LIMIT,
        skip = 0,
        history = false,
        neighbors,
        orderBy,
        orderByDirection,
        returnProperties,
        count,
        model: inputModel,
        ...rest
    } = checkStandardOptions(opt);

    const query = parseSubquery({
        history, model: inputModel, target, ...rest,
    });
    const model = schema.models[inputModel] || schema.models[target];

    // try to project the ordering to ensure they are valid properties
    if (orderBy) {
        propsToProjection(model || schema.models.V, orderBy);
    }

    let projection = '*';

    if (returnProperties) {
        projection = propsToProjection(model || schema.models.V, returnProperties, true);
    } else if (neighbors && neighbors < 2) {
        projection = nestedProjection(neighbors);
    } else if (neighbors) {
        projection = nonSpecificProjection((model || schema.models.V), {
            depth: neighbors,
            edges: schema.getEdgeModels().filter((e) => !e.isAbstract).map((e) => e.name),
            history,
        });
    }

    return new WrapperQuery({
        count,
        history,
        limit,
        orderBy,
        orderByDirection,
        projection,
        query,
        skip,
        target,
    });
};


export {parse};
