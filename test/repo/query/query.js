const {
    schema: SCHEMA_DEFN,
    util: {castDecimalInteger, castToRID}
} = require('@bcgsc/knowledgebase-schema');

const {
    Clause, Comparison, Query, Traversal, constants: {NEIGHBORHOOD_EDGES, OPERATORS}
} = require('./../../../app/repo/query');
const {quoteWrap} = require('./../../../app/repo/util');

const SOURCE_PROPS = SCHEMA_DEFN.Source.queryProperties;
const DISEASE_PROPS = SCHEMA_DEFN.Disease.queryProperties;
const FEATURE_PROPS = SCHEMA_DEFN.Feature.queryProperties;

const {stripSQL} = require('./util');


describe('Query Parsing', () => {
    test('parses a complex traversal', () => {
        const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.V, {
            where: {
                attr: 'inE(ImpliedBy).vertex',
                value: {
                    type: 'neighborhood',
                    where: [
                        {
                            attr: 'name',
                            value: 'KRAS'
                        }
                    ],
                    class: 'Feature',
                    depth: 3
                }
            },
            neighbors: 3,
            limit: 1000
        });
        const expected = new Query(
            SCHEMA_DEFN.V.name,
            new Clause('AND', [
                new Comparison(
                    new Traversal({
                        type: 'EDGE', edges: ['ImpliedBy'], direction: 'in', child: new Traversal({attr: 'outV()', cast: castToRID})
                    }),
                    new Query(
                        'Feature',
                        new Clause('AND', [
                            new Comparison(
                                new Traversal({attr: 'name', property: FEATURE_PROPS.name}), 'KRAS'
                            )
                        ]),
                        {type: 'neighborhood', limit: null}
                    )
                )
            ]),
            {limit: 1000, neighbors: 3}
        );
        expect(parsed).toEqual(expected);
    });
    test('uses contains for an edge traversal', () => {
        const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.V, {
            where: {
                attr: 'out(ImpliedBy).vertex.reference1.name',
                value: 'kras'
            },
            neighbors: 3,
            limit: 1000
        });
        const expected = new Query(
            SCHEMA_DEFN.V.name,
            new Clause('AND', [
                new Comparison(
                    new Traversal({
                        type: 'EDGE',
                        edges: ['ImpliedBy'],
                        direction: 'out',
                        child: new Traversal({
                            attr: 'inV()',
                            cast: castToRID,
                            child: new Traversal({
                                attr: 'reference1',
                                child: 'name'
                            })
                        })
                    }),
                    'kras',
                    'CONTAINS'
                )
            ]),
            {limit: 1000, neighbors: 3}
        );
        expect(parsed.toString()).toEqual(expected.toString());
    });
    test('parses a simple single Comparison', () => {
        const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
            where: [{
                attr: 'name',
                value: 'thing'
            }],
            activeOnly: true
        });
        const expected = new Query(
            SCHEMA_DEFN.Disease.name,
            new Clause('AND', [
                new Comparison(
                    new Traversal({attr: 'name', property: DISEASE_PROPS.name}),
                    'thing'
                )
            ])
        );
        expect(expected).toEqual(parsed);
    });
    test('parses a simple single Comparison including history', () => {
        const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
            where: [{
                attr: 'name',
                value: 'thing'
            }],
            activeOnly: false
        });
        const expected = new Query(
            SCHEMA_DEFN.Disease.name,
            new Clause('AND', [
                new Comparison(
                    new Traversal({attr: 'name', property: DISEASE_PROPS.name}),
                    'thing'
                )
            ]),
            {activeOnly: false}
        );
        expect(parsed).toEqual(expected);
    });
    describe('nested Clause', () => {
        test('AND then OR', () => {
            const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                where: [
                    {attr: 'name', value: 'thing'},
                    {
                        operator: 'OR',
                        comparisons: [
                            {attr: 'sourceId', value: '1234'},
                            {attr: 'sourceId', value: '12345'}
                        ]
                    }
                ],
                activeOnly: false
            });
            const expected = new Query(
                SCHEMA_DEFN.Disease.name,
                new Clause('AND', [
                    new Comparison(
                        new Traversal({attr: 'name', property: DISEASE_PROPS.name}),
                        'thing'
                    ),
                    new Clause('OR', [
                        new Comparison(new Traversal({attr: 'sourceId', property: DISEASE_PROPS.sourceId}), '1234'),
                        new Comparison(new Traversal({attr: 'sourceId', property: DISEASE_PROPS.sourceId}), '12345')
                    ])
                ]),
                {activeOnly: false}
            );
            expect(parsed).toEqual(expected);
        });
    });
    describe('list attributes', () => {
        test.todo('uses contains if the input value is not also a list');
    });
    describe('orderBy', () => {
        test('parses a single order column', () => {
            const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                where: [],
                activeOnly: false,
                orderBy: ['@rid']
            });

            const expected = new Query(
                SCHEMA_DEFN.Disease.name,
                new Clause('AND', []),
                {activeOnly: false, orderBy: ['@rid']}
            );
            expect(parsed).toEqual(expected);
            const sql = 'SELECT * FROM Disease ORDER BY @rid ASC LIMIT 1000';
            const {query, params} = parsed.toString();
            expect(params).toEqual({});
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });
        test('descending order', () => {
            const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                where: [],
                activeOnly: false,
                orderBy: ['name'],
                orderByDirection: 'DESC'
            });

            const expected = new Query(
                SCHEMA_DEFN.Disease.name,
                new Clause('AND', []),
                {activeOnly: false, orderBy: ['name'], orderByDirection: 'DESC'}
            );
            expect(parsed).toEqual(expected);
            const sql = 'SELECT * FROM Disease ORDER BY name DESC LIMIT 1000';
            const {query, params} = parsed.toString();
            expect(params).toEqual({});
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });
        test('parses a multiple ordering columns', () => {
            const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                where: [],
                activeOnly: false,
                orderBy: ['@rid', '@class'],
                limit: null
            });

            const expected = new Query(
                SCHEMA_DEFN.Disease.name,
                new Clause('AND', []),
                {activeOnly: false, orderBy: ['@rid', '@class'], limit: null}
            );
            expect(parsed).toEqual(expected);
            const sql = 'SELECT * FROM Disease ORDER BY @rid ASC, @class ASC';
            const {query, params} = parsed.toString();
            expect(params).toEqual({});
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });
    });
    describe('subquery', () => {
        test('link in subquery', () => {
            const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                where: [
                    {
                        attr: 'source',
                        value: {
                            class: 'Source',
                            where: [
                                {attr: 'name', value: 'disease-ontology'}
                            ],
                            activeOnly: true
                        }
                    }
                ],
                activeOnly: true
            });
            const expected = new Query(
                SCHEMA_DEFN.Disease.name,
                new Clause('AND', [
                    new Comparison(
                        new Traversal({attr: 'source', property: DISEASE_PROPS.source}),
                        new Query(
                            SCHEMA_DEFN.Source.name,
                            new Clause(
                                'AND', [
                                    new Comparison({attr: 'name', property: SOURCE_PROPS.name}, 'disease-ontology')
                                ]
                            ),
                            {activeOnly: true, limit: null}
                        )
                    )
                ]),
                {activeOnly: true}
            );
            expect(parsed).toEqual(expected);
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
            const parsed = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                where: [
                    {
                        attr: 'source',
                        value: {
                            class: 'Source',
                            where: [
                                {attr: 'name', value: 'disease-ontology'}
                            ],
                            type: 'neighborhood',
                            activeOnly: false
                        }
                    }
                ],
                activeOnly: false
            });
            const expected = new Query(
                SCHEMA_DEFN.Disease.name,
                new Clause('AND', [
                    new Comparison(
                        new Traversal({attr: 'source', property: DISEASE_PROPS.source}),
                        new Query(
                            SCHEMA_DEFN.Source.name,
                            new Clause(
                                'AND', [
                                    new Comparison({attr: 'name', property: SOURCE_PROPS.name}, 'disease-ontology')
                                ]
                            ),
                            {type: 'neighborhood', activeOnly: false, limit: null}
                        )
                    )
                ]),
                {activeOnly: false}
            );
            expect(parsed).toEqual(expected);
            const sql = `SELECT * FROM Disease
                WHERE source IN (SELECT * FROM (
                    MATCH {class: Source, WHERE: (name = :param0)}.both(
                        ${Array.from(NEIGHBORHOOD_EDGES, quoteWrap).join(', ')}
                    ){WHILE: ($depth < 3)} RETURN DISTINCT $pathElements)) LIMIT 1000`;
            const {query, params} = parsed.toString();
            expect(params).toEqual({param0: 'disease-ontology'});
            expect(stripSQL(query)).toBe(stripSQL(sql));
        });
        test('query by string in subset', () => {

        });
    });
});


describe('Comparison', () => {
    describe('constructor', () => {
        test('throws error on non-std operator', () => {
            expect(() => {
                new Comparison('blargh', 'monkeys', 'BAD');
            }).toThrowError('Invalid operator');
        });
        test('throws error on AND operator', () => {
            expect(() => {
                new Comparison('blargh', 'monkeys', 'AND');
            }).toThrowError('Invalid operator');
        });
        test('throws error on OR operator', () => {
            expect(() => {
                new Comparison('blargh', 'monkeys', 'OR');
            }).toThrowError('Invalid operator');
        });
    });
    describe('toString', () => {
        test('wrap when negated', () => {
            const comp = new Comparison('blargh', 'monkeys', OPERATORS.EQ, true);
            const {query, params} = comp.toString();
            expect(query).toBe('NOT (blargh = :param0)');
            expect(params).toEqual({param0: 'monkeys'});
        });
        test('value is a list', () => {
            const comp = new Comparison('blargh', ['monkeys', 'monkees'], OPERATORS.EQ, true);
            const {query, params} = comp.toString();
            expect(query).toBe('NOT (blargh = [:param0, :param1])');
            expect(params).toEqual({param0: 'monkeys', param1: 'monkees'});
        });
    });
    describe('validate', () => {
        test('throws error on GT and iterable prop', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        cast: castDecimalInteger,
                        iterable: true
                    }
                }),
                '1',
                OPERATORS.GT
            );
            expect(comp.validate.bind(comp)).toThrowError('cannot be used in conjunction with an iterable property');
        });
        test('casts all values in an Array individually', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        cast: castDecimalInteger,
                        iterable: true
                    }
                }),
                ['1', '2', '3'],
                OPERATORS.IN
            );
            comp.validate();
            expect(comp.value).toEqual([1, 2, 3]);
        });
        test('checks values against an choices for each value in an Array', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: true,
                        choices: ['blargh', 'monkey']
                    }
                }),
                ['blargh', 'monkey'],
                OPERATORS.IN
            );
            comp.validate();
        });
        test('Error on bad choices value in array', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: true,
                        choices: ['blargh', 'modnkey']
                    }
                }),
                ['blargh', 'monkey'],
                OPERATORS.IN
            );
            expect(comp.validate.bind(comp)).toThrowError('restricted to enum values');
        });
        test('Error on non-terable prop = LIST', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: false
                    }
                }),
                ['blargh', 'monkey'],
                OPERATORS.EQ
            );
            expect(comp.validate.bind(comp)).toThrowError('Using a direct comparison');
        });
        test('Error on iterable prop CONTAINS LIST', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: true
                    }
                }),
                ['blargh', 'monkey'],
                OPERATORS.CONTAINS
            );
            expect(comp.validate.bind(comp)).toThrowError('CONTAINS should be used with non-iterable values');
        });
        test('Error on non-iterable prop contains', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: false
                    }
                }),
                'monkey',
                OPERATORS.CONTAINS
            );
            expect(comp.validate.bind(comp)).toThrowError('CONTAINS can only be used with iterable properties');
        });
        test('Error on iterable prop contains NULL', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: true
                    }
                }),
                null,
                OPERATORS.CONTAINS
            );
            expect(comp.validate.bind(comp)).toThrowError('used for NULL comparison');
        });
        test('Error on non-iterable value using IN', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: false
                    }
                }),
                'blarghmonkeys',
                OPERATORS.IN
            );
            expect(comp.validate.bind(comp)).toThrowError('IN should only be used with iterable values');
        });
        test('Error on iterable prop = non-null, non-iterable value', () => {
            const comp = new Comparison(
                new Traversal({
                    attr: 'blargh',
                    property: {
                        iterable: true
                    }
                }),
                'blarghmonkeys',
                OPERATORS.EQ
            );
            expect(comp.validate.bind(comp)).toThrowError('must be against an iterable value');
        });
    });
});


describe('SQL', () => {
});
