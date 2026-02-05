const { ValidationError } = require('@bcgsc-pori/graphkb-schema');

const { keywordSearch } = require('../../../src/repo/query_builder/fixed');

describe('keywordSearch', () => {
    test('throw error on CONTAINSTEXT keyword containing seperator chars', () => {
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
});
