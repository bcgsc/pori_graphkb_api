const {
    schema: schemaDefn,
} = require('@bcgsc/knowledgebase-schema');


const { propsToProjection, parsePropertyList } = require('../../../src/repo/query_builder/util');


describe('propsToProjection', () => {
    test('deeply nested projection', () => {
        const projection = propsToProjection(schemaDefn.schema.Statement, [
            'conditions.@rid',
            'conditions.@class',
            'conditions.reference1.@class',
            'conditions.reference1.@rid',
            'conditions.reference2.@class',
            'conditions.reference2.@rid',
        ], true);
        expect(projection).toEqual('conditions:{ @rid, @class, reference1:{ @rid, @class }, reference2:{ @rid, @class } }');
    });
});

describe('parsePropertyList', () => {
    test('deeply nested projection', () => {
        const obj = parsePropertyList(schemaDefn.schema.Statement, [
            'conditions.@rid',
            'conditions.@class',
            'conditions.reference1.@class',
            'conditions.reference1.@rid',
            'conditions.reference2.@class',
            'conditions.reference2.@rid',
        ], false);
        expect(obj).toEqual({
            conditions: {
                '@class': {},
                '@rid': {},
                reference1: {
                    '@class': {},
                    '@rid': {},
                },
                reference2: {
                    '@class': {},
                    '@rid': {},
                },
            },
        });
    });
});
