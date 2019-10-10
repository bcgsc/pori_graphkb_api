

const {schema: {schema}} = require('@bcgsc/knowledgebase-schema');

const {
    propsToProjection, checkStandardOptions, nestedProjection, displayQuery, getQueryableProps
} = require('./util');
const {Subquery} = require('./fragment');
const constants = require('./constants');

const {MAX_LIMIT} = constants;

/**
 * Top level query class
 */
class WrapperQuery {
    constructor({
        target, limit, skip, projection, query, orderByDirection, orderBy, count = false, history = false
    }) {
        this.target = target;
        this.limit = limit;
        this.skip = skip;
        this.projection = projection;
        this.query = query;
        this.orderBy = orderBy;
        this.orderByDirection = orderByDirection;
        this.count = count;
        this.history = history;
    }

    expectedCount() {
        if (this.query.expectedCount() && !this.skip) {
            let count = this.query.expectedCount();
            if (this.limit !== null) {
                count = Math.min(this.limit, count);
            }
            return count;
        }
        return null;
    }

    toString() {
        const {
            skip, limit, projection, count, orderByDirection, orderBy
        } = this;
        const {query, params} = this.query.toString(0);

        if (!count && !orderBy && !skip && limit === undefined) {
            // don't need to wrap since there are no modificiations
            return {query, params};
        }

        let statement = query;
        if (projection !== '*') {
            statement = `SELECT ${projection} FROM (${query})`;
        } else if (count) {
            statement = `SELECT count(*) AS count FROM (${query})`;
        }

        if (!count) {
            if (orderBy) {
                const direction = orderByDirection || 'ASC';
                const ordering = orderBy.map(p => `${p} ${direction}`);
                statement = `${statement} ORDER BY ${ordering.join(', ')}`;
            }
            if (skip) {
                statement = `${statement} SKIP ${skip}`;
            }
            if (limit !== undefined && limit !== null) {
                statement = `${statement} LIMIT ${limit}`;
            }
        }
        return {query: statement, params};
    }

    displayString() {
        return displayQuery(this.toString());
    }

    static parse(opt) {
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
            ...rest
        } = checkStandardOptions(opt);

        const query = Subquery.parse({target, history, ...rest});
        const model = schema[target];

        // try to project the ordering to ensure they are valid properties
        if (orderBy) {
            propsToProjection(model || schema.V, orderBy);
        }

        let projection = '*';

        if (returnProperties) {
            projection = propsToProjection(model || schema.V, returnProperties);
        } else if (neighbors) {
            projection = nestedProjection(neighbors, !history);
        }

        return new this({
            target,
            limit,
            skip,
            projection,
            orderBy,
            orderByDirection,
            count,
            query,
            history
        });
    }
}


const parse = query => WrapperQuery.parse(query);

/**
 * Given some input record, create a query to find it
 *
 * @param {ClassModel} model the model/class to query
 * @param {object} record the record content
 *
 */
const parseRecord = (model, record, {activeIndexOnly = false, ...opt} = {}) => {
    const query = {...opt, target: model.name, filters: {AND: []}};
    const filters = query.filters.AND;
    const content = {...record};

    const activeIndexProps = model.getActiveProperties();
    const properties = Object.values(model.properties).filter(
        prop => !activeIndexOnly || activeIndexProps.includes(prop.name)
    );

    for (const prop of properties.sort((a, b) => a.name.localeCompare(b.name))) {
        if (content[prop.name] === undefined) {
            if (!activeIndexOnly) {
                continue;
            } else {
                content[prop.name] = null; // nulls are included in the active index
            }
        }
        if (prop.type.includes('embedded') && prop.linkedClass && content[prop.name]) {
            for (const [propKey, subprop] of Object.entries(getQueryableProps(prop.linkedClass)).sort()) {
                const propChain = `${prop.name}.${propKey}`;
                const value = content[prop.name][subprop.name];

                if (value !== undefined) {
                    filters.push({[propChain]: value});
                }
            }
        } else {
            filters.push({[prop.name]: content[prop.name]});
        }
    }
    const result = parse(query);
    return result;
};


module.exports = {
    WrapperQuery, parse, parseRecord, constants
};
