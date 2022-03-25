import orientjs from 'orientjs';
import http from 'http';
import express from 'express';
import { OpenApiSpec } from './routes/openapi/types';

export interface ConfigType {
    GKB_BASE_PATH: string;
    GKB_CORS_ORIGIN: string;
    GKB_DB_CREATE: boolean;
    GKB_DB_HOST: string;
    GKB_DB_MIGRATE: boolean;
    GKB_DB_NAME: string; // name of the database we are connecting to
    GKB_DB_PASS: string;
    GKB_DB_POOL: number;
    GKB_DB_PORT: string;
    GKB_DB_USER: string;
    GKB_DBS_PASS: string; // database server password
    GKB_DBS_USER: string; // database server username
    GKB_DISABLE_AUTH: boolean;
    GKB_HOST: string;
    GKB_KEY_FILE: string; // path to the private key file used to generate tokens
    GKB_KEY: string;
    GKB_KEYCLOAK_CLIENT_ID: string;
    GKB_KEYCLOAK_CLIENT_SECRET: string;
    GKB_KEYCLOAK_KEY_FILE: string; // path to the file we will load the public key from to check the tokens coming from out authentication server
    GKB_KEYCLOAK_KEY: string;
    GKB_KEYCLOAK_ROLE: string;
    GKB_KEYCLOAK_URI: string;
    GKB_LOG_LEVEL: string;
    GKB_PORT: string;
    GKB_USER_CREATE: boolean;
};

type ArrayLengthMutationKeys = 'splice' | 'push' | 'pop' | 'shift' | 'unshift' | number;
type ArrayItems<T extends Array<any>> = T extends Array<infer TItems> ? TItems : never;



export type FixedLengthArray<T extends any[]> =
    Pick<T, Exclude<keyof T, ArrayLengthMutationKeys>>
    & { [Symbol.iterator]: () => IterableIterator<ArrayItems<T>> };


export interface BuiltQuery { query: string; params: Record<string, unknown> };
/*Query input types*/


/*query classes*/
export interface QueryElement {
    toString: (paramIndex: number, prefix?: string) => BuiltQuery;
}


export type QUERY_TYPE = 'ancestors' | 'descendants' | 'neighborhood' | 'similarTo' | 'keyword' | 'edge';

export abstract class QueryBase implements QueryElement {
    abstract toString(paramIndex?: number, prefix?: string | undefined): BuiltQuery;
    abstract expectedCount(): number | null;
    abstract readonly queryType?: string;
    abstract readonly isSubquery: boolean;
    readonly history?: boolean;
}

/** Type Guards */
export function isObj(arg: unknown): arg is { [key: string]: unknown; } {
    return Boolean(arg && typeof arg === 'object') && !Array.isArray(arg);
}

export function isSubquery(arg: unknown): arg is QueryBase {
    return isObj(arg) && arg.isSubquery === true;
}

export function isControlledVocabulary(arg: unknown, vocabulary: unknown[]): arg is typeof vocabulary[number] {
    return vocabulary.includes(arg);
}

export function isControlledValue<T>(arg: unknown, vocab: Record<string, T> | T[]): arg is T {
    if (Array.isArray(vocab)) {
        return vocab.includes(arg as T);
    }
    return Object.values(vocab).includes(arg as T);
}

export interface OrientRecordId {
    cluster: number;
    position: number;

    toString(): string;
}

export interface AppServerType {
    app: express.Express;
    db: orientjs.Server | null;
    server: http.Server | null;
    conf: ConfigType;
    router: express.Router;
    prefix: string;
    host: string;
    port: number | string;
    pool?: orientjs.Db;
    spec?: OpenApiSpec;
}
