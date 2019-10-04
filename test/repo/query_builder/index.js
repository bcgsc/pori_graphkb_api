const {
    parse
} = require('../../../app/repo/query_builder');

const {stripSQL} = require('./util');


describe('WrapperQuery.parse', () => {
    test('parses a simple single Comparison', () => {
        const parsed = parse({
            target: 'Disease',
            filters: {name: 'thing'},
            history: false,
            limit: null
        });
        const {query, params} = parsed.toString();
        expect(query).toEqual('SELECT * FROM (SELECT * FROM Disease WHERE name = :param0) WHERE deletedAt IS NULL');
        expect(params).toEqual({param0: 'thing'});
    });
    test('parses a simple single Comparison including history', () => {
        const parsed = parse({
            target: 'Disease',
            filters: {name: 'thing'},
            history: true,
            limit: null
        });
        const {query, params} = parsed.toString();
        expect(query).toEqual('SELECT * FROM Disease WHERE name = :param0');
        expect(params).toEqual({param0: 'thing'});
    });
    test('parses embedded attribute traversal', () => {
        const parsed = parse({
            target: 'PositionalVariant',
            filters: {
                AND: [
                    {'break1Start.refAA': 'G'},
                    {
                        OR: [
                            {untemplatedSeqSize: 1},
                            {untemplatedSeqSize: null}
                        ]
                    },
                    {
                        OR: [
                            {untemplatedSeq: 'V'},
                            {untemplatedSeq: 'X'},
                            {untemplatedSeq: null}
                        ]
                    },
                    {'break1Start.pos': 12}
                ]
            },
            history: false,
            limit: 1000
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
                filters: [],
                history: true,
                orderBy: ['@rid'],
                target: 'Disease'
            });
            const sql = 'SELECT * FROM Disease ORDER BY @rid ASC LIMIT 1000';
            const {query, params} = parsed.toString();
            expect(params).toEqual({});
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });
        test('descending order', () => {
            const parsed = parse({
                filters: [],
                history: true,
                orderBy: ['name'],
                orderByDirection: 'DESC',
                target: 'Disease'
            });
            const sql = 'SELECT * FROM Disease ORDER BY name DESC LIMIT 1000';
            const {query, params} = parsed.toString();
            expect(params).toEqual({});
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });
        test('parses a multiple ordering columns', () => {
            const parsed = parse({
                filters: {},
                history: true,
                orderBy: ['@rid', '@class'],
                limit: null,
                target: 'Disease'
            });

            const sql = 'SELECT * FROM Disease ORDER BY @rid ASC, @class ASC';
            const {query, params} = parsed.toString();
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
                        filters: {name: 'disease-ontology'}
                    }
                },
                target: 'Disease'
            });
            const sql = stripSQL(`
                SELECT *
                    FROM (SELECT *
                        FROM Disease
                        WHERE source IN
                            (SELECT * FROM (SELECT * FROM Source WHERE name = :param0) WHERE deletedAt IS NULL)
                        )
                    WHERE deletedAt IS NULL LIMIT 1000`);
            const {query, params} = parsed.toString();
            expect(params).toEqual({param0: 'disease-ontology'});
            expect(query).toBe(sql);
        });
        test('link in neighborhood subquery', () => {
            const parsed = parse({
                filters: {
                    source: {
                        target: 'Source',
                        filters: {name: 'disease-ontology'},
                        queryType: 'neighborhood',
                        history: true
                    }
                },
                history: true,
                target: 'Disease'
            });
            const sql = `SELECT * FROM Disease
                WHERE source IN (SELECT * FROM (
                    MATCH {class: Source, WHERE: (name = :param0)}.both(){WHILE: ($depth < 3)} RETURN DISTINCT $pathElements)) LIMIT 1000`;
            const {query, params} = parsed.toString();
            expect(params).toEqual({param0: 'disease-ontology'});
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });
    });
});
