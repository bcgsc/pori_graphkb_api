const { schema } = require('@bcgsc-pori/graphkb-schema');

const {
    parse, parseRecord,
} = require('../../../src/repo/query_builder');

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
            break1Start: { '@class': 'ProteinPosition', pos: 12, refAA: 'G' },
            reference1: '#4:3',
            type: '5:3',
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
    test('multiple keyword search params', () => {
        const parsed = parse({
            filters: {
                AND: [
                    {
                        conditions: { keyword: 'EGFR', queryType: 'keyword', target: 'Variant' },
                        operator: 'CONTAINSANY',
                    },
                    {
                        conditions: { keyword: 'glio', queryType: 'keyword', target: 'Disease' },
                        operator: 'CONTAINSANY',
                    },
                ],
            },
            limit: 100,
            neighbors: 2,
            skip: 0,
            target: 'Statement',
        });
        const { params } = parsed.toString();
        expect(params).toEqual({
            param0w0: 'egfr',
            param1w0: 'glio',
        });
    });

    test('parse edge query', () => {
        const parsed = parse({
            filters: {
                AND: [
                    {
                        in: '#124:42320',
                    },
                    {
                        out: '#124:35332',
                    },
                    {
                        source: '#38:1',
                    },
                ],
            },
            neighbors: 1,
            target: {
                direction: 'out',
                queryType: 'edge',
                target: 'ElementOf',
                vertexFilter: '#124:35332',
            },
        });
        const { query, params } = parsed.toString();
        expect(query).toEqual('SELECT *, *:{*, @rid, @class, !history} FROM (SELECT * FROM (SELECT * FROM (SELECT expand(outE(\'ElementOf\')) FROM [#124:35332]) WHERE in = :param0 AND out = :param1 AND source = :param2) WHERE deletedAt IS NULL) LIMIT 1000');
        expect(params).toEqual({ param0: '#124:42320', param1: '#124:35332', param2: '#38:1' });
    });

    test('parses a simple single Comparison', () => {
        const parsed = parse({
            filters: { name: 'thing' },
            history: false,
            limit: null,
            target: 'Disease',
        });
        const { query, params } = parsed.toString();
        expect(query).toEqual('SELECT * FROM (SELECT * FROM Disease WHERE name = :param0) WHERE deletedAt IS NULL');
        expect(params).toEqual({ param0: 'thing' });
    });

    test('parses a simple single Comparison including history', () => {
        const parsed = parse({
            filters: { name: 'thing' },
            history: true,
            limit: null,
            target: 'Disease',
        });
        const { query, params } = parsed.toString();
        expect(query).toEqual('SELECT * FROM Disease WHERE name = :param0');
        expect(params).toEqual({ param0: 'thing' });
    });

    test('add size check for equals comparison of iterables', () => {
        const parsed = parse({
            filters: { conditions: ['#3:2', '#4:3'] },
            history: true,
            limit: null,
            target: 'Statement',
        });
        const { query, params } = parsed.toString();
        expect(query).toEqual('SELECT * FROM Statement WHERE (conditions CONTAINSALL [:param0, :param1] AND conditions.size() = :param2)');
        expect(params.param0).toEqual('#3:2');
        expect(params.param1).toEqual('#4:3');
        expect(params.param2).toEqual(2);
    });

    test('specify custom operator for iterables', () => {
        const parsed = parse({
            filters: { conditions: ['#3:2', '#4:3'], operator: 'CONTAINSALL' },
            history: true,
            limit: null,
            target: 'Statement',
        });
        const { query, params } = parsed.toString();
        expect(query).toEqual('SELECT * FROM Statement WHERE conditions CONTAINSALL [:param0, :param1]');
        expect(params.param0).toEqual('#3:2');
        expect(params.param1).toEqual('#4:3');
    });

    test('parses embedded attribute traversal', () => {
        const parsed = parse({
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
            target: 'PositionalVariant',
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
                limit: null,
                orderBy: ['@rid', '@class'],
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
                        filters: { name: 'disease-ontology' },
                        target: 'Source',
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
                        filters: { name: 'disease-ontology' },
                        history: true,
                        queryType: 'neighborhood',
                        target: 'Source',
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
                disambiguate: false,
                history: true,
                queryType: 'ancestors',
                target: ['#3:2', '#4:5'],
            });
            const sql = 'TRAVERSE in(\'SubclassOf\') FROM [#3:2, #4:5] MAXDEPTH 50 LIMIT 1000';
            const { query, params } = parsed.toString();
            expect(params).toEqual({});
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });

        test('target ridList without history', () => {
            const parsed = parse({
                disambiguate: false,
                history: false,
                queryType: 'descendants',
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
                disambiguate: false,
                edges: ['AliasOf', 'DeprecatedBy'],
                history: false,
                queryType: 'descendants',
                target: ['#3:2', '#4:5'],
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
