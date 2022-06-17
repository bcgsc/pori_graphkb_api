const { merge } = require('lodash');
const {
    ValidationError,
    schema: schemaDefn,
} = require('@bcgsc-pori/graphkb-schema');

const { getQueryableProps } = require('./util');

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
 * calculate the SQL (orientdb) projection from an edge record
 * @param {ClassModel} model the schema model
 * @param {string} direction the edge direction
 * @param {*} opt pass-through optins to hand off to projectionFromProperties
 */
const projectEdge = (modelName, direction, opt) => {
    const target = direction === 'out'
        ? 'in'
        : 'out';
    const model = schemaDefn.get(modelName);

    const edgeProjection = projectionFromProperties(
        Object.values(schemaDefn.queryableProperties(modelName)).filter((p) => !['out', 'in'].includes(p.name)),
        { ...opt, isEdge: true },
    ).join(', ');
    const targetModel = (direction === 'out'
        ? model.targetModel
        : model.sourceModel) || 'V';
    const targetProjection = projectionFromProperties(
        Object.values(schemaDefn.queryableProperties(targetModel)),
        { ...opt, isEdge: false, linkDepth: (opt.linkDepth || 1) - 1 },
    ).join(', ');
    const edgeString = model.name === 'E'
        ? ''
        : `'${model.name}'`;
    return `${direction}E(${edgeString}):{${edgeProjection}, ${target}:{${targetProjection}}} as ${direction}_${model.name}`;
};

/**
 * calculate the SQL (orientdb) projection from an list of properties record
 * @param {PropertyDefinition[]} queryableProperties
 * @param {boolean} isEdge is the starting record an edge?
 * @param {string} edges list of edge classes to expand on
 * @param {Number} depth distance to expand related records
 * @param {boolean} history flag if true to include deleted records
 * @param {Array.<string>} exclude list of properties to exclude in expanded records
 * @param {Array.<string>} terminal list of properties that should not have their edges/links expanded
 */
const projectionFromProperties = (queryableProperties, {
    isEdge = false,
    depth = 1,
    edges = null,
    history = false,
    exclude = ['groupRestrictions', 'permissions', 'groups', 'permissions'],
    terminal = ['createdBy', 'updatedBy', 'deletedBy'],
} = {}) => {
    const properties = ['@class', '@rid', '*'];

    for (const prop of queryableProperties.sort((p1, p2) => p1.name.localeCompare(p2.name))) {
        if (
            exclude.includes(prop.name)
            || (prop.name === 'deletedBy' && !history)
            || (prop.name === 'history' && !history)
        ) {
            continue;
        }

        if (depth) {
            let { linkedClass } = prop;

            if (prop.type === 'link' || prop.type === 'linkset') {
                linkedClass = linkedClass || 'V';
            }

            if (linkedClass && !schemaDefn.get(linkedClass).embedded) {
                const innerQueryProps = Object.values(schemaDefn.queryableProperties(linkedClass));
                const innerProps = projectionFromProperties(
                    terminal.includes(prop.name)
                        ? []
                        : innerQueryProps,
                    {
                        depth: depth - 1,
                        exclude,
                        history,
                        isEdge: false,
                        terminal,
                    },
                );

                properties.push(`${prop.name}:{${innerProps.join(', ')}}`);
            }
        }
    }

    if (!history) {
        properties.push('!history');
    }

    if (edges && !isEdge) {
        for (const direction of ['out', 'in']) {
            if (edges.length) {
                for (const edge of edges) {
                    properties.push(projectEdge(
                        edge,
                        direction,
                        {
                            depth,
                            exclude,
                            history,
                            terminal,
                        },
                    ));
                }
            } else {
                properties.push(projectEdge(
                    'E',
                    direction,
                    {
                        depth,
                        exclude,
                        history,
                        terminal,
                    },
                ));
            }
        }
    }
    return properties;
};

/**
 * For a given model expand the current record for a specific depth
 * @param {ClassDefinition} model
 * @param {*} opt options to pass-through to projectionFromProperties
 */
const nonSpecificProjection = (modelName, opt) => {
    const props = projectionFromProperties(
        Object.values(schemaDefn.queryableProperties(modelName)),
        {
            edges: null,
            ...opt,
            isEdge: schemaDefn.get(modelName).isEdge,
        },
    );
    return props
        .filter((p) => p !== '!history') // cannot top level exclude
        .join(', ');
};

/**
 * Convert a list of property names to a nested object representing the projection of
 * these properties. Validates the property list against the input model
 *
 * @param {string} model the model to validate the property list against
 * @param {Array.<string>} properties the list of properties to be parsed/validated
 * @param {boolean} allowDirectEmbedded flag to indicate if an error should be throw for embedded props without a subprop selection
 */
const parsePropertyList = (modelName, properties, allowDirectEmbedded = false) => {
    const projections = {};
    const propModels = getQueryableProps(modelName, allowDirectEmbedded);

    for (const prop of properties) {
        const [directProp] = prop.trim().split('.');
        const propModel = propModels[directProp];
        projections[directProp] = projections[directProp] || {};

        if (!propModel) {
            throw new ValidationError(`property ${directProp} does not exist or cannot be accessed on the model ${modelName}`);
        }

        const nestedProps = prop.trim().slice(directProp.length + 1);

        if (nestedProps) {
            if (!propModel.linkedClass) {
                throw new ValidationError(`Cannot return nested property (${prop}), the property (${propModel.name}) does not have a linked class`);
            }
            const innerProjection = parsePropertyList(propModel.linkedClass, [nestedProps]);
            merge(projections[directProp], innerProjection);
        }
    }
    return projections;
};

/**
 *
 * @param {ClassDefinition} model
 * @param {string[]} properties
 * @param {boolean} allowDirectEmbedded
 * @returns
 */
const propsToProjection = (model, properties, allowDirectEmbedded = false) => {
    const projection = parsePropertyList(model, properties, allowDirectEmbedded);

    const convertToString = (obj) => {
        const keyList = [];

        for (const key of Object.keys(obj).sort()) {
            if (Object.keys(obj[key]).length) {
                keyList.push(`${key}:{ ${convertToString(obj[key])} }`);
            } else {
                keyList.push(key);
            }
        }
        return keyList.join(', ');
    };
    return convertToString(projection);
};

module.exports = {
    nestedProjection,
    nonSpecificProjection,
    parsePropertyList,
    projectionFromProperties,
    propsToProjection,
};
