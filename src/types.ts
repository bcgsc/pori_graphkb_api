import { Property, ClassModel } from '@bcgsc-pori/graphkb-schema'
import { GraphRecordId } from '@bcgsc-pori/graphkb-schema/dist/constants';

type ArrayLengthMutationKeys = 'splice' | 'push' | 'pop' | 'shift' | 'unshift' | number;
type ArrayItems<T extends Array<any>> = T extends Array<infer TItems> ? TItems : never;
export type FixedLengthArray<T extends any[]> =
    Pick<T, Exclude<keyof T, ArrayLengthMutationKeys>>
    & { [Symbol.iterator]: () => IterableIterator<ArrayItems<T>> };


export interface BuiltQuery { query: string; params: Record<string, unknown> };
/*Query input types*/

export interface QueryInput {
    target: string | string[] | GraphRecordId[] | QueryInput;
    history?: boolean;
    filters?: FilterClauseInput;
    queryType?: string;
    direction?: 'out' | 'in';
}

export interface QueryOptions {
    skip?: number;
    orderBy?: string[];
    orderByDirection?: "ASC" | "DESC";
    count?: boolean;
    neighbors?: number;
    limit?: number;
    returnProperties?: string[];
    history?: boolean;
}

interface AndFilterClauseInput {
    AND: Array<FilterComparisonInput | QueryInput>
};

interface OrFilterClauseInput {
    OR: Array<FilterComparisonInput | QueryInput>
};

export type FilterClauseInput = AndFilterClauseInput | OrFilterClauseInput;

export interface FilterComparisonInput {
    negate?: boolean;
    operator?: string;
    [key: string]: any | QueryInput | FilterClauseInput | FilterComparisonInput;
}


/*query classes*/
export interface QueryElement {
    isSubquery?: boolean;
    target?: string | QueryElement;

    toString: (paramIndex: number, prefix?: string) => BuiltQuery;
}

export interface FilterClause extends QueryElement {
    model: string;
    operator: string;
    filters: Array<FilterClause|FilterComparison|QueryElement>;
};

export interface FilterComparison extends QueryElement {
    name: string;
    prop: Property;
    value: unknown;
    operator: string;
    negate: boolean;
    isLength: boolean;

    get valueIsIterable(): boolean;

    validate(): unknown;
    toString(paramIndex: number): BuiltQuery;
}


export interface QueryType extends QueryElement {
    expectedCount(): number | null;
    queryType?: string;
}
