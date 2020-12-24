const {
    schema: schemaDefn,
} = require('@bcgsc-pori/graphkb-schema');

const { stripSQL } = require('./util');
const { nonSpecificProjection, propsToProjection, parsePropertyList } = require('./../../../src/repo/query_builder/projection');


describe('nonSpecificProjection', () => {
    test('linkDepth 0', () => {
        const result = nonSpecificProjection(
            schemaDefn.schema.Statement, { depth: 0, edges: null },
        );
        expect(result).toEqual([
            '@class',
            '@rid',
            '*',
        ].join(', '));
    });

    test('linkDepth 1', () => {
        const result = nonSpecificProjection(
            schemaDefn.schema.Statement, { depth: 1, edges: null },
        );
        expect(result).toEqual([
            '@class',
            '@rid',
            '*',
            'conditions:{@class, @rid, *, !history}',
            'createdBy:{@class, @rid, *, !history}',
            'evidence:{@class, @rid, *, !history}',
            'evidenceLevel:{@class, @rid, *, !history}',
            'relevance:{@class, @rid, *, !history}',
            'source:{@class, @rid, *, !history}',
            'subject:{@class, @rid, *, !history}',
            'updatedBy:{@class, @rid, *, !history}',
        ].join(', '));
    });

    test('linkDepth 2', () => {
        const result = nonSpecificProjection(
            schemaDefn.schema.Statement, { depth: 2, edges: null },
        );
        expect(result).toEqual([
            '@class',
            '@rid',
            '*',
            'conditions:{@class, @rid, *, createdBy:{@class, @rid, *, !history}, dependency:{@class, @rid, *, !history}, reference1:{@class, @rid, *, !history}, reference2:{@class, @rid, *, !history}, source:{@class, @rid, *, !history}, type:{@class, @rid, *, !history}, updatedBy:{@class, @rid, *, !history}, !history}',
            'createdBy:{@class, @rid, *, !history}',
            'evidence:{@class, @rid, *, createdBy:{@class, @rid, *, !history}, dependency:{@class, @rid, *, !history}, source:{@class, @rid, *, !history}, updatedBy:{@class, @rid, *, !history}, !history}',
            'evidenceLevel:{@class, @rid, *, createdBy:{@class, @rid, *, !history}, dependency:{@class, @rid, *, !history}, source:{@class, @rid, *, !history}, updatedBy:{@class, @rid, *, !history}, !history}',
            'relevance:{@class, @rid, *, createdBy:{@class, @rid, *, !history}, dependency:{@class, @rid, *, !history}, source:{@class, @rid, *, !history}, updatedBy:{@class, @rid, *, !history}, !history}',
            'source:{@class, @rid, *, createdBy:{@class, @rid, *, !history}, updatedBy:{@class, @rid, *, !history}, !history}',
            'subject:{@class, @rid, *, createdBy:{@class, @rid, *, !history}, dependency:{@class, @rid, *, !history}, reference1:{@class, @rid, *, !history}, reference2:{@class, @rid, *, !history}, source:{@class, @rid, *, !history}, type:{@class, @rid, *, !history}, updatedBy:{@class, @rid, *, !history}, !history}',
            'updatedBy:{@class, @rid, *, !history}',
        ].join(', '));
    });

    test('linkDepth 1 with edges', () => {
        const result = nonSpecificProjection(
            schemaDefn.schema.Statement, { depth: 1, edges: ['AliasOf'] },
        );
        expect(result).toEqual(stripSQL(`
        @class, @rid, *,
        conditions:{@class, @rid, *, !history},
        createdBy:{@class, @rid, *, !history},
        evidence:{@class, @rid, *, !history},
        evidenceLevel:{@class, @rid, *, !history},
        relevance:{@class, @rid, *, !history},
        source:{@class, @rid, *, !history},
        subject:{@class, @rid, *, !history},
        updatedBy:{@class, @rid, *, !history},
        outE('AliasOf'):{
            @class, @rid, *,
            createdBy:{@class, @rid, *, !history},
            source:{@class, @rid, *, !history},
            !history,
            in:{
                @class, @rid, *,
                createdBy:{@class, @rid, *, !history},
                dependency:{@class, @rid, *, !history},
                source:{@class, @rid, *, !history},
                updatedBy:{@class, @rid, *, !history},
                !history
            }
        } as out_AliasOf,
        inE('AliasOf'):{
            @class, @rid, *,
            createdBy:{@class, @rid, *, !history},
            source:{@class, @rid, *, !history},
            !history,
            out:{
                @class, @rid, *,
                createdBy:{@class, @rid, *, !history},
                dependency:{@class, @rid, *, !history},
                source:{@class, @rid, *, !history},
                updatedBy:{@class, @rid, *, !history},
                !history
            }
        } as in_AliasOf`));
    });
});


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
        expect(projection).toEqual('conditions:{ @class, @rid, reference1:{ @class, @rid }, reference2:{ @class, @rid } }');
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
