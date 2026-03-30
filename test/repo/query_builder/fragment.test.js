const { ValidationError } = require('@bcgsc-pori/graphkb-schema');

const { Comparison } = require('../../../src/repo/query_builder/fragment');

describe('Comparison', () => {
    const newComparison = new Comparison({
        name: 'Ontology',
        operator: 'CONTAINSTEXT',
        prop: 'name',
        value: 'abcdef',
    });

    test('not to throw error on valid CONTAINSTEXT value', () => {
        expect(() => newComparison.validate()).not.toThrow(ValidationError);
    });

    test('throw error on CONTAINSTEXT value containing whitespaces', () => {
        newComparison.value = 'abc def';
        expect(() => newComparison.validate()).toThrow(ValidationError);
    });

    test('throw error on CONTAINSTEXT value containing separator chars', () => {
        newComparison.value = 'abc:def';
        expect(() => newComparison.validate()).toThrow(ValidationError);
    });
});
