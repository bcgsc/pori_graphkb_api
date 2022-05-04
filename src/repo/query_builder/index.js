const { schema: schemaDefn } = require('@bcgsc-pori/graphkb-schema');

const {
    checkStandardOptions, displayQuery, getQueryableProps,
} = require('./util');
const {
    propsToProjection, nonSpecificProjection, nestedProjection,
} = require('./projection');
const { parseSubquery } = require('./parse');
const constants = require('./constants');

const { MAX_LIMIT } = constants;

/**
 * Top level query class
 */
class WrapperQuery {
    constructor({
        target, limit, skip, projection, query, orderByDirection, orderBy, count = false, history = false,
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
        if (!this.count && this.query.expectedCount() && !this.skip) {
            let count = this.query.expectedCount();

            if (this.limit !== null) {
                count = Math.min(this.limit, count);
            }
            return count;
        }
        return null;
    }

    buildSQL() {
        const {
            skip, limit, projection, count, orderByDirection, orderBy,
        } = this;
        const { query, params } = this.query.buildSQL(0);

        if (!count && !orderBy && !skip && limit === undefined) {
            // don't need to wrap since there are no modifications
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
        return displayQuery(this.buildSQL());
    }
}

/**
 * Given some input record, create a query to find it
 *
 * @param {object} query JSON query object
 *
 */
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
    const model = schemaDefn.get(inputModel, false) || schemaDefn.get(target, false) || schemaDefn.models.V;

    // try to project the ordering to ensure they are valid properties
    if (orderBy) {
        propsToProjection(model.name, orderBy);
    }

    let projection = '*';

    if (returnProperties) {
        projection = propsToProjection(model.name, returnProperties, true);
    } else if (neighbors && neighbors < 2) {
        projection = nestedProjection(neighbors);
    } else if (neighbors) {
        projection = nonSpecificProjection((model.name), {
            depth: neighbors,
            edges: schemaDefn.getEdgeModels().filter((e) => !e.isAbstract).map((e) => e.name),
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

/**
 * Given some input record, create a query to find it
 *
 * @param {string} modelName the model/class to query
 * @param {object} record the record content
 *
 */
const parseRecord = (modelName, record, { activeIndexOnly = false, ...opt } = {}) => {
    const query = { ...opt, filters: { AND: [] }, target: modelName };

    if (record['@rid']) {
        query.target = [record['@rid']];
        query.model = modelName;
    }

    const filters = query.filters.AND;
    const content = { ...record };

    const activeIndexProps = schemaDefn.activeProperties(modelName);
    const properties = Object.values(schemaDefn.getProperties(modelName)).filter(
        (prop) => !activeIndexOnly || activeIndexProps.includes(prop.name),
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
                    filters.push({ [propChain]: value });
                }
            }
        } else {
            filters.push({ [prop.name]: content[prop.name] });
        }
    }
    const result = parse(query);
    return result;
};

module.exports = {
    parse, parseRecord,
};
