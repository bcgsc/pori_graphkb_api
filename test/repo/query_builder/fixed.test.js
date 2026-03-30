const { ValidationError } = require('@bcgsc-pori/graphkb-schema');

const { keywordSearch } = require('../../../src/repo/query_builder/fixed');

describe('keywordSearch', () => {
    test('throw error on CONTAINSTEXT keyword containing separator chars', () => {
        expect(() => keywordSearch({
            keyword: 'abc:def',
            operator: 'CONTAINSTEXT',
            paramIndex: 0,
            target: 'Ontology',
        })).toThrow(ValidationError);
    });

    test('not to throw error on valid CONTAINSTEXT keyword', () => {
        expect(() => keywordSearch({
            keyword: 'abc def',
            operator: 'CONTAINSTEXT',
            paramIndex: 0,
            target: 'Ontology',
        })).not.toThrow(ValidationError);
    });

    test('CategoryVariant special case: not to throw error', () => {
        expect(() => keywordSearch({
            keyword: 'gene1:gene2 fusion',
            operator: 'CONTAINSTEXT',
            paramIndex: 0,
            target: 'CategoryVariant',
        })).not.toThrow(ValidationError);
    });

    test('PositionalVariant special case: not to throw error', () => {
        expect(() => keywordSearch({
            keyword: 'gene:p.123del',
            operator: 'CONTAINSTEXT',
            paramIndex: 0,
            target: 'PositionalVariant',
        })).not.toThrow(ValidationError);
    });

    test('Variant special case: not to throw error', () => {
        expect(() => keywordSearch({
            keyword: 'abc:def',
            operator: 'CONTAINSTEXT',
            paramIndex: 0,
            target: 'Variant',
        })).not.toThrow(ValidationError);
    });
});
