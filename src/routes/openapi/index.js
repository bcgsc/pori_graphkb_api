/**
 * Generates the openAPI specification for the Graph KB
 */

/**
 * @constant
 * @ignore
 */
const _ = require('lodash');
const fs = require('fs');
const HTTP_STATUS = require('http-status-codes');
const swaggerUi = require('swagger-ui-express');


const {
    POST_TOKEN,
    POST_PARSE,
    GET_SCHEMA,
    GET_VERSION,
    QUERY,
    GET_STATS,
} = require('./routes');
const responses = require('./responses');
const schemas = require('./schemas');
const { GENERAL_QUERY_PARAMS, BASIC_HEADER_PARAMS, ONTOLOGY_QUERY_PARAMS } = require('./params');
const {
    ABOUT_FILE, QUERY_ABOUT,
} = require('./constants');


const SCHEMA_PREFIX = '#/components/schemas';


const STUB = {
    openapi: '3.0.0',
    info: {
        title: 'GraphKB',
        version: process.env.npm_package_version,
    },
    paths: {
        '/token': { post: POST_TOKEN },
        '/parse': { post: POST_PARSE },
        '/schema': { get: GET_SCHEMA },
        '/version': { get: GET_VERSION },
        '/query': { post: QUERY },
        '/spec': {
            get: {
                summary: 'Returns this specification',
                tags: ['Metadata'],
                parameters: [
                    {
                        in: 'query',
                        schema: { type: 'string', enum: ['swagger', 'redoc'] },
                        description: 'rendering style to apply to the spec',
                        name: 'display',
                    },
                ],
                responses: {
                    200: {},
                },
            },
        },
        '/spec.json': {
            get: {
                summary: 'Returns the JSON format of this specification',
                tags: ['Metadata'],
                responses: {
                    200: {
                        schema: { type: 'object' },
                    },
                },
            },
        },
        '/stats': { get: GET_STATS },
    },
    components: {
        schemas: Object.assign({
            '@rid': {
                type: 'string',
                pattern: '^#\\d+:\\d+$',
                description: 'Record ID',
                example: '#44:0',
            },
            RecordId: { $ref: '#/components/schemas/@rid' },
        }, schemas),
        parameters: {
            in: {
                in: 'query',
                name: 'in',
                schema: { $ref: `${SCHEMA_PREFIX}/RecordLink` },
                description: 'The record ID of the vertex the edge goes into, the target/destination vertex',
            },
            out: {
                in: 'query',
                name: 'out',
                schema: { $ref: `${SCHEMA_PREFIX}/RecordLink` },
                description: 'The record ID of the vertex the edge comes from, the source vertex',
            },
        },
        responses,
    },
    tags: [{
        name: 'Metadata', description: 'routes dealing with app metadata',
    },
    {
        name: 'General', description: 'non-class specific routes',
    }],
};


/**
 * Create a OneOf statement to show that links can be the expanded object or just the @rid
 *
 * @param {string} model the model/table name
 * @param {boolean} nullable indicates if the value can be null
 *
 * @returns {object} the swagger parameter schema description
 */
const linkOrModel = (model, nullable = false) => {
    const param = {
        anyOf: [
            {
                $ref: `${SCHEMA_PREFIX}/@rid`,
            },
            {
                $ref: `${SCHEMA_PREFIX}/${model}`,
            },
        ],
    };

    if (nullable) {
        param.nullable = true;
    }
    return param;
};


/**
 * Given a class model, generate the swagger documentation for the POST route
 *
 * @param {ClassModel} model the model to build the route for
 * @returns {Object} json representing the openapi spec defn
 */
const describePost = (model) => {
    const links = {};

    if (model.routes.GET) {
        links.getById = {
            parameters: { rid: '$response.body#/result.@rid' },
            operationId: `get_${model.routeName.slice(1)}__rid_`,
            description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [GET \`${
                model.routeName
            }/{rid}\`](.#/${
                model.name
            }/get_${
                model.routeName.slice(1)
            }__rid_) requests`,
        };
    }
    if (model.routes.PATCH) {
        links.patchById = {
            parameters: { rid: '$response.body#/result.@rid' },
            operationId: `patch_${model.routeName.slice(1)}__rid_`,
            description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [PATCH \`${
                model.routeName
            }/{rid}\`](.#/${
                model.name
            }/patch_${
                model.routeName.slice(1)
            }__rid_) requests`,
        };
    }
    if (model.routes.DELETE) {
        links.deleteById = {
            parameters: { rid: '$response.body#/result.@rid' },
            operationId: `delete_${model.routeName.slice(1)}__rid_`,
            description: `The \`@rid\` value returned in the response can be used as the \`rid\` parameter in [DELETE \`${
                model.routeName
            }/{rid}\`](.#/${
                model.name
            }/delete_${
                model.routeName.slice(1)
            }__rid_) requests`,
        };
    }
    const post = {
        summary: `create a new ${model.name} record`,
        tags: [model.name],
        parameters: Array.from(Object.values(BASIC_HEADER_PARAMS), p => ({ $ref: `#/components/parameters/${p.name}` })),
        requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: `${SCHEMA_PREFIX}/${model.name}` } } },
        },
        responses: {
            201: {
                description: 'A new record was created',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                result: { $ref: `${SCHEMA_PREFIX}/${model.name}` },
                            },
                        },
                    },
                },
                links,
            },
            401: { $ref: '#/components/responses/NotAuthorized' },
            400: { $ref: '#/components/responses/BadInput' },
            409: { $ref: '#/components/responses/RecordExistsError' },
            403: { $ref: '#/components/responses/Forbidden' },
        },
    };
    return post;
};


/**
 * Given a class model, generate the swagger documentation for the OPERATION/:id route where
 * OPERATION can be delete, patch, etc.
 *
 * @param {ClassModel} model the model to build the route for
 * @returns {Object} json representing the openapi spec defn
 */
const describeOperationByID = (model, operation = 'delete') => {
    const description = {
        summary: `${operation} ${model.name} record by ID`,
        tags: [model.name],
        parameters: _.concat(Array.from(Object.values(BASIC_HEADER_PARAMS), p => ({ $ref: `#/components/parameters/${p.name}` })),
            [{
                in: 'path',
                name: 'rid',
                schema: { $ref: `${SCHEMA_PREFIX}/@rid` },
                description: 'The record identifier',
                example: '#34:1',
                required: true,
            }]),
        responses: {
            200: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                result: {
                                    $ref: `${SCHEMA_PREFIX}/${model.name}`,
                                },
                            },
                        },
                    },
                },
            },
            401: { $ref: '#/components/responses/NotAuthorized' },
            400: { $ref: '#/components/responses/BadInput' },
            404: { $ref: '#/components/responses/RecordNotFound' },
            403: { $ref: '#/components/responses/Forbidden' },
        },
    };

    if (operation !== 'delete') {
        description.responses[409] = { $ref: '#/components/responses/RecordExistsError' };
    }
    if (operation === 'get') {
        description.parameters.push({ $ref: '#/components/parameters/neighbors' });
    }
    return description;
};


const tagsSorter = (tag1, tag2) => {
    const starterTags = ['Metadata', 'General', 'Statement'];
    tag1 = tag1.name || tag1;
    tag2 = tag2.name || tag2;

    // show the 'default' group at the top
    if (starterTags.includes(tag1) && starterTags.includes(tag2)) {
        return starterTags.indexOf(tag1) - starterTags.indexOf(tag2);
    } if (starterTags.includes(tag1)) {
        return -1;
    } if (starterTags.includes(tag2)) {
        return 1;
    }
    return tag1.localeCompare(tag2);
};


/**
 * Generates the JSON object that represents the openapi specification for this API
 *
 * @param {Object.<string,ClassModel>} schema the database schema loaded from loadSchema
 * @param {Object} metadata
 * @param {number} metadata.port the port number the API is being served on
 * @param {string} metadata.host the host serving the API
 * @see loadSchema
 *
 * @returns {Object} the JSON object representing the swagger API specification
 */
const generateSwaggerSpec = (schema, metadata) => {
    const docs = { ...STUB };
    docs.servers = [{
        url: `http://${metadata.host}:${metadata.port}/api`,
    }];
    docs.components.parameters = Object.assign(
        docs.components.parameters,
        GENERAL_QUERY_PARAMS,
        BASIC_HEADER_PARAMS,
        ONTOLOGY_QUERY_PARAMS,
    );
    // Add the MD about section

    const about = Array.from(
        [ABOUT_FILE, QUERY_ABOUT],
        filename => fs.readFileSync(filename).toString(),
    ).join('\n\n');
    docs.info.description = about;

    // simple routes
    for (const model of Object.values(schema)) {
        if (model.description) {
            docs.tags.push({ name: model.name, description: model.description });
        }
        // create the model in the schemas section
        docs.components.schemas[model.name] = {
            type: 'object',
            properties: {},
        };

        if (Object.values(model.routes).some(x => x) && docs.paths[model.routeName] === undefined) {
            docs.paths[model.routeName] = docs.paths[model.routeName] || {};
        }
        if (model.routes.POST && !docs.paths[model.routeName].post) {
            docs.paths[model.routeName].post = describePost(model);
        }
        if (model.routes.GET || model.routes.PATCH || model.routes.DELETE) {
            if (!docs.paths[`${model.routeName}/{rid}`]) {
                docs.paths[`${model.routeName}/{rid}`] = {};
            }
            if (model.routes.PATCH && !docs.paths[`${model.routeName}/{rid}`].patch) {
                docs.paths[`${model.routeName}/{rid}`].patch = describeOperationByID(model, 'patch');
            }
            if (model.routes.DELETE && !docs.paths[`${model.routeName}/{rid}`].delete) {
                docs.paths[`${model.routeName}/{rid}`].delete = describeOperationByID(model, 'delete');
            }
            if (model.routes.GET && !docs.paths[`${model.routeName}/{rid}`].get) {
                docs.paths[`${model.routeName}/{rid}`].get = describeOperationByID(model, 'get');
            }
        }
        if (model.isAbstract) {
            // should inherit from its concrete subclasses instead
            const anyOf = model.subclasses.map(m => ({ $ref: `#/components/schemas/${m.name}` }));
            docs.components.schemas[model.name].anyOf = anyOf;
            continue;
        }

        // for all model properties add a query parameter to the main GET request. Also add to the model components spec
        for (const prop of Object.values(model.properties)) {
            const isList = !!/(list|set)/g.exec(prop.type);

            if (prop.generated) {
                continue;
            }

            if (prop.mandatory && prop.default === undefined && prop.generateDefault === undefined) {
                if (docs.components.schemas[model.name].required === undefined) {
                    docs.components.schemas[model.name].required = [];
                }
                docs.components.schemas[model.name].required.push(prop.name);
            }
            if (docs.components.schemas[prop.name] && model.name !== 'Permissions') {
                docs.components.schemas[model.name].properties[prop.name] = { $ref: `#/components/schemas/${prop.name}` };
                continue;
            }
            let propDefn = {};
            docs.components.schemas[model.name].properties[prop.name] = propDefn;

            if (isList) {
                propDefn.type = 'array';
                propDefn.items = { minItems: prop.minItems, maxItems: prop.maxItems };
                propDefn = propDefn.items;
            }
            if (prop.name === 'subsets') {
                propDefn.type = 'string';
            } else if (prop.linkedClass) {
                if (prop.type.includes('embedded')) {
                    propDefn.$ref = `#/components/schemas/${prop.linkedClass.name}`;
                } else if (docs.components.schemas[`${prop.linkedClass.name}Link`]) {
                    propDefn.$ref = `#/components/schemas/${prop.linkedClass.name}Link`;
                } else {
                    Object.assign(propDefn, linkOrModel(prop.linkedClass.name));
                }
            } else if (prop.type.includes('link')) {
                propDefn.$ref = `${SCHEMA_PREFIX}/RecordLink`;
                propDefn.description = docs.components.schemas.RecordLink.description;
            } else {
                propDefn.type = prop.type === 'long'
                    ? 'integer'
                    : prop.type;
            }
            if (prop.choices) {
                propDefn.enum = prop.choices;
            }
        }
    }

    // sort the route parameters, first by required and then alpha numerically
    for (const route of Object.keys(docs.paths)) {
        for (const defn of Object.values(docs.paths[route])) {
            if (!defn.parameters) {
                continue;
            }
            defn.parameters.sort((p1, p2) => {
                if (p1.$ref) {
                    let pname = p1.$ref.split('/');
                    pname = pname[pname.length - 1];
                    p1 = Object.assign({}, docs.components.parameters[pname], p1);
                }
                if (p2.$ref) {
                    let pname = p2.$ref.split('/');
                    pname = pname[pname.length - 1];
                    p2 = Object.assign({}, docs.components.parameters[pname], p2);
                }
                if (p1.required && !p2.required) {
                    return -1;
                } if (!p1.required && p2.required) {
                    return 1;
                } if (p1.name < p2.name) {
                    return -1;
                } if (p1.name > p2.name) {
                    return 1;
                }
                return 0;
            });
        }
    }

    docs.tags.sort(tagsSorter);

    const vertexTags = Object.values(schema)
        .filter(model => !model.isEdge && model.name !== 'Statement')
        .map(model => model.name);

    const edgeTags = Object.values(schema)
        .filter(model => model.isEdge)
        .map(model => model.name);

    docs['x-tagGroups'] = [
        {
            name: 'Frequently Used',
            tags: ['Metadata', 'General', 'Statement'],
        },
        {
            name: 'Vertex Class Routes',
            tags: vertexTags,
        },
        {
            name: 'Relationship Class Routes',
            tags: edgeTags,
        },
    ];
    return docs;
};


/**
 * Add the /spec.json, /spec, and /spec/redoc endpoints to a router
 */
const registerSpecEndpoints = (router, spec) => {
    // serve the spec as plain json
    router.get('/spec.json', (req, res) => {
        res.status(HTTP_STATUS.OK).json(spec);
    });
    // set up the swagger-ui docs
    router.use('/spec/swagger', swaggerUi.serve, swaggerUi.setup(spec, {
        swaggerOptions: {
            deepLinking: true,
            displayOperationId: true,
            defaultModelRendering: 'model',
            operationsSorter: 'alpha',
            tagsSorter,
            docExpansion: 'none',
        },
        customCss: '.swagger-ui .info pre > code { display: block; color: #373939}',
    }));

    // serve with re-doc
    router.get('/spec', (req, res) => {
        if (req.query.display && req.query.display === 'swagger') {
            return res.redirect('/api/spec/swagger');
        }
        const content = `<!DOCTYPE html>
        <html>
          <head>
            <title>GraphKB API Spec</title>
            <!-- needed for adaptive design -->
            <meta charset="utf-8"/>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
            <style>
              body {
                margin: 0;
                padding: 0;
              }
            </style>
          </head>
          <body>
            <redoc require-props-first="true" sort-props-alphabetically="true" spec-url="${req.baseUrl}/spec.json"></redoc>
            <script src="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js"> </script>
          </body>
        </html>`;
        res.set('Content-Type', 'text/html');
        return res.status(HTTP_STATUS.OK).send(content);
    });
};

module.exports = { generateSwaggerSpec, registerSpecEndpoints };
