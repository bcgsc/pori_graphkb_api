const { ValidationError } = require('@bcgsc-pori/graphkb-schema');

const { Comparison } = require('../../../src/repo/query_builder/fragment');

describe('Comparison', () => {
    // Ontology
    const OntologyComparison = new Comparison({
        name: 'Ontology',
        operator: 'CONTAINSTEXT',
        prop: 'name',
        value: 'abcdef',
    });

    test('not to throw error on valid CONTAINSTEXT value', () => {
        expect(() => OntologyComparison.validate()).not.toThrow(ValidationError);
    });

    test('throw error on CONTAINSTEXT value containing whitespaces', () => {
        OntologyComparison.value = 'abc def';
        expect(() => OntologyComparison.validate()).toThrow(ValidationError);
    });

    test('throw error on CONTAINSTEXT value containing separator chars', () => {
        OntologyComparison.value = 'abc:def';
        expect(() => OntologyComparison.validate()).toThrow(ValidationError);
    });

    // Variant
    const VariantComparison = new Comparison({
        name: 'Variant',
        operator: 'CONTAINSTEXT',
        prop: 'displayName',
        value: 'abc:def',
    });

    test('Variant special case: not to throw error', () => {
        expect(() => VariantComparison.validate()).not.toThrow(ValidationError);
    });

    test('CategoryVariant special case: not to throw error', () => {
        VariantComparison.name = 'CategoryVariant';
        VariantComparison.value = 'gene1:gene2 fusion';
        expect(() => VariantComparison.validate()).not.toThrow(ValidationError);
    });

    test('PositionalVariant special case: not to throw error', () => {
        VariantComparison.name = 'PositionalVariant';
        VariantComparison.value = 'gene:p.123del';
        expect(() => VariantComparison.validate()).not.toThrow(ValidationError);
    });
});
