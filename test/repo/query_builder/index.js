const { schema } = require('@bcgsc/knowledgebase-schema');

const {
    parse, parseRecord,
} = require('../../../app/repo/query_builder');

const { stripSQL } = require('./util');


describe('WrapperQuery.parseRecord', () => {
    test('select basic record', () => {
        const record = { name: 'bob' };
        const { query, params } = parseRecord(schema.get('User'), record, { history: true }).toString();
        expect(query).toEqual('SELECT * FROM User WHERE name = :param0 LIMIT 1000');
        expect(params).toEqual({ param0: 'bob' });
    });

    test('select record with embedded properties', () => {
        const record = {
            reference1: '#4:3',
            type: '5:3',
            break1Start: { refAA: 'G', pos: 12, '@class': 'ProteinPosition' },
            untemplatedSeq: 'D',
            untemplatedSeqSize: 1,
        };
        const { query, params } = parseRecord(schema.get('PositionalVariant'), record, { history: true }).toString();
        expect(stripSQL(query)).toEqual(stripSQL(`SELECT * FROM PositionalVariant WHERE
            break1Start.@class = :param0
            AND break1Start.pos = :param1
            AND break1Start.refAA = :param2
            AND reference1 = :param3
            AND type = :param4
            AND untemplatedSeq = :param5
            AND untemplatedSeqSize = :param6
            LIMIT 1000
        `));
        expect(params.param0).toEqual('ProteinPosition');
    });
});


describe('WrapperQuery.parse', () => {
    test('parses a simple single Comparison', () => {
        const parsed = parse({
            target: 'Disease',
            filters: { name: 'thing' },
            history: false,
            limit: null,
        });
        const { query, params } = parsed.toString();
        expect(query).toEqual('SELECT * FROM (SELECT * FROM Disease WHERE name = :param0) WHERE deletedAt IS NULL');
        expect(params).toEqual({ param0: 'thing' });
    });

    test('parses a simple single Comparison including history', () => {
        const parsed = parse({
            target: 'Disease',
            filters: { name: 'thing' },
            history: true,
            limit: null,
        });
        const { query, params } = parsed.toString();
        expect(query).toEqual('SELECT * FROM Disease WHERE name = :param0');
        expect(params).toEqual({ param0: 'thing' });
    });

    test('add size check for equals comparison of iterables', () => {
        const parsed = parse({
            target: 'Statement',
            filters: { impliedBy: ['#3:2', '#4:3'] },
            history: true,
            limit: null,
        });
        const { query, params } = parsed.toString();
        expect(query).toEqual('SELECT * FROM Statement WHERE (impliedBy CONTAINSALL [:param0, :param1] AND impliedBy.size() = :param2)');
        expect(params.param0).toEqual('#3:2');
        expect(params.param1).toEqual('#4:3');
        expect(params.param2).toEqual(2);
    });

    test('specify custom operator for iterables', () => {
        const parsed = parse({
            target: 'Statement',
            filters: { impliedBy: ['#3:2', '#4:3'], operator: 'CONTAINSALL' },
            history: true,
            limit: null,
        });
        const { query, params } = parsed.toString();
        expect(query).toEqual('SELECT * FROM Statement WHERE impliedBy CONTAINSALL [:param0, :param1]');
        expect(params.param0).toEqual('#3:2');
        expect(params.param1).toEqual('#4:3');
    });

    test('parses embedded attribute traversal', () => {
        const parsed = parse({
            target: 'PositionalVariant',
            filters: {
                AND: [
                    { 'break1Start.refAA': 'G' },
                    {
                        OR: [
                            { untemplatedSeqSize: 1 },
                            { untemplatedSeqSize: null },
                        ],
                    },
                    {
                        OR: [
                            { untemplatedSeq: 'V' },
                            { untemplatedSeq: 'X' },
                            { untemplatedSeq: null },
                        ],
                    },
                    { 'break1Start.pos': 12 },
                ],
            },
            history: false,
            limit: 1000,
        });

        const statement = parsed.displayString();
        expect(statement).toEqual(stripSQL(`SELECT * FROM (
            SELECT * FROM PositionalVariant
            WHERE
                break1Start.refAA = 'G'
                AND (untemplatedSeqSize = 1 OR untemplatedSeqSize IS NULL)
                AND (untemplatedSeq = 'V' OR untemplatedSeq = 'X' OR untemplatedSeq IS NULL)
                AND break1Start.pos = 12
            ) WHERE deletedAt IS NULL LIMIT 1000`));
    });

    describe('list attributes', () => {
        test.todo('uses contains if the input value is not also a list');
    });

    describe('orderBy', () => {
        test('parses a single order column', () => {
            const parsed = parse({
                history: true,
                orderBy: ['@rid'],
                target: 'Disease',
            });
            const sql = 'SELECT * FROM Disease ORDER BY @rid ASC LIMIT 1000';
            const { query, params } = parsed.toString();
            expect(params).toEqual({});
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });

        test('descending order', () => {
            const parsed = parse({
                history: true,
                orderBy: ['name'],
                orderByDirection: 'DESC',
                target: 'Disease',
            });
            const sql = 'SELECT * FROM Disease ORDER BY name DESC LIMIT 1000';
            const { query, params } = parsed.toString();
            expect(params).toEqual({});
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });

        test('parses a multiple ordering columns', () => {
            const parsed = parse({
                history: true,
                orderBy: ['@rid', '@class'],
                limit: null,
                target: 'Disease',
            });

            const sql = 'SELECT * FROM Disease ORDER BY @rid ASC, @class ASC';
            const { query, params } = parsed.toString();
            expect(params).toEqual({});
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });
    });

    describe('subquery', () => {
        test('link in subquery', () => {
            const parsed = parse({
                filters: {
                    source: {
                        target: 'Source',
                        filters: { name: 'disease-ontology' },
                    },
                },
                target: 'Disease',
            });
            const sql = stripSQL(`
                SELECT *
                    FROM (SELECT *
                        FROM Disease
                        WHERE source IN
                            (SELECT * FROM (SELECT * FROM Source WHERE name = :param0) WHERE deletedAt IS NULL)
                        )
                    WHERE deletedAt IS NULL LIMIT 1000`);
            const { query, params } = parsed.toString();
            expect(params).toEqual({ param0: 'disease-ontology' });
            expect(query).toBe(sql);
        });

        test('link in neighborhood subquery', () => {
            const parsed = parse({
                filters: {
                    source: {
                        target: 'Source',
                        filters: { name: 'disease-ontology' },
                        queryType: 'neighborhood',
                        history: true,
                    },
                },
                history: true,
                target: 'Disease',
            });
            const sql = `SELECT * FROM Disease
                WHERE source IN (SELECT * FROM (
                    MATCH {class: Source, WHERE: (name = :param0)}.both(){WHILE: ($depth < 3)} RETURN DISTINCT $pathElements)) LIMIT 1000`;
            const { query, params } = parsed.toString();
            expect(params).toEqual({ param0: 'disease-ontology' });
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });
    });

    describe('top level treeQuery', () => {
        test('target ridList', () => {
            const parsed = parse({
                queryType: 'ancestors',
                history: true,
                target: ['#3:2', '#4:5'],
            });
            const sql = 'TRAVERSE in(\'SubclassOf\') FROM [#3:2, #4:5] MAXDEPTH 50 LIMIT 1000';
            const { query, params } = parsed.toString();
            expect(params).toEqual({});
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });

        test('target ridList without history', () => {
            const parsed = parse({
                queryType: 'descendants',
                history: false,
                target: ['#3:2', '#4:5'],
            });
            const sql = `SELECT * FROM (
                TRAVERSE out('SubclassOf') FROM [#3:2, #4:5] MAXDEPTH 50
            ) WHERE deletedAt IS NULL LIMIT 1000`;
            const { query, params } = parsed.toString();
            expect(params).toEqual({});
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });

        test('custom edges', () => {
            const parsed = parse({
                queryType: 'descendants',
                history: false,
                target: ['#3:2', '#4:5'],
                edges: ['AliasOf', 'DeprecatedBy'],
            });
            const sql = `SELECT * FROM (
                TRAVERSE out('AliasOf', 'DeprecatedBy') FROM [#3:2, #4:5] MAXDEPTH 50
            ) WHERE deletedAt IS NULL LIMIT 1000`;
            const { query, params } = parsed.toString();
            expect(params).toEqual({});
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });

        test.todo('error on invalid edge class name');

        test.todo('throw error on filters given');

        test.todo('error on modelName for target');
    });
});
