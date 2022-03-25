import swaggerTypes from "swagger-schema-official";

export type OpenApiReference = swaggerTypes.Reference;

export interface OpenApiSchema extends Omit<swaggerTypes.Schema, 'allOf' | 'items' | 'properties' | 'additionalProperties'> {
    anyOf?: OpenApiSchema[];
    allOf?: OpenApiSchema[];
    oneOf?: OpenApiSchema[];
    items?: OpenApiSchema;
    properties?: Record<string, OpenApiSchema>;
    nullable?: boolean;
    additionalProperties?: OpenApiSchema | boolean;
};
export type OpenApiQueryParam = swaggerTypes.QueryParameter & { nullable?: boolean; schema: OpenApiSchema, required?: boolean; name?: string };
export type OpenApiHeaderParam = swaggerTypes.HeaderParameter & { schema: OpenApiSchema, required?: boolean; name?: string };
export interface OpenApiResponse {
    description?: string;
    content?: {
        [key: string]: {schema: OpenApiSchema}
    };
    links?: {
        [key: string]: {
            description?: string;
            operationId: string;
            parameters: Record<string,string>;
        }
    };
};


export interface OpenApiPath {
    parameters?: Array<OpenApiHeaderParam | OpenApiQueryParam | OpenApiReference>;
    requestBody?: {
        content: {
            [key: string]: {
                examples?: {[key: string]: {description?: string; value: unknown;}};
                schema: OpenApiSchema;
            }
        };
        required?: boolean;
    },
    responses: Record<number,OpenApiResponse | OpenApiReference>,
    summary?: string;
    tags?: string[];

};

export interface OpenApiSpec {
    components: {
        parameters: Record<string,OpenApiHeaderParam | OpenApiQueryParam | OpenApiReference>;
        responses: Record<string, OpenApiResponse>;
        schemas: Record<string, OpenApiSchema>;
    };
    openapi: string;
    servers: {url: string}[];
    info: Partial<swaggerTypes.Info>;
    paths: {
        [key: string]: Partial<{
            get: OpenApiPath;
            post: OpenApiPath;
            put: OpenApiPath;
            patch: OpenApiPath;
            delete: OpenApiPath;
        }>
    };
    tags: swaggerTypes.Tag[];
};
