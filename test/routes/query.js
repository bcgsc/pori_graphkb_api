/**
 * tests for the parsing of query parameters into the std body query format for POST requets
 */
const qs = require('qs');

const {schema: SCHEMA_DEFN} = require('@bcgsc/knowledgebase-schema');

const DISEASE_PROPS = SCHEMA_DEFN.Disease.queryProperties;
const SOURCE_PROPS = SCHEMA_DEFN.Source.queryProperties;


const {
    constants: {TRAVERSAL_TYPE, OPERATORS}, Query, Clause, Comparison, Traversal
} = require('./../../app/repo/query');
const {
    flattenQueryParams, formatTraversal, parseValue, parse, parseCompoundAttr
} = require('./../../app/routes/query');


describe('flattenQueryParams', () => {
    test('flattens single level query', () => {
        const flat = flattenQueryParams({
            key: 'value'
        });
        expect(flat).toEqual([{attrList: ['key'], value: 'value'}]);
    });
    test('chains mutli-level query', () => {
        const flat = flattenQueryParams({
            key1: {key2: 'value'}
        });
        expect(flat).toEqual([{attrList: ['key1', 'key2'], value: 'value'}]);
    });
    test('Does not chain lists', () => {
        const flat = flattenQueryParams({
            key1: {key2: ['value1', 'value2']}
        });
        expect(flat).toEqual([{attrList: ['key1', 'key2'], value: ['value1', 'value2']}]);
    });
});


describe('formatTraversal', () => {
    test('returns direct for single attr', () => {
        const formatted = formatTraversal(['a']);
        expect(formatted).toEqual({attr: 'a'});
    });
    test('creates links for intermediary attrs', () => {
        const formatted = formatTraversal(['a', 'b', 'c']);
        expect(formatted).toEqual({
            attr: 'a',
            type: TRAVERSAL_TYPE.LINK,
            child: {
                attr: 'b',
                type: TRAVERSAL_TYPE.LINK,
                child: {attr: 'c'}
            }
        });
    });
});


describe('parseValue', () => {
    test('parses basic equals', () => {
        const parsed = parseValue('attr', 'blargh');
        expect(parsed).toEqual({
            attr: 'attr',
            value: 'blargh',
            negate: false
        });
    });
    test('parses null', () => {
        const parsed = parseValue('attr', 'null');
        expect(parsed).toEqual({
            attr: 'attr',
            value: null,
            negate: false
        });
    });
    test('parses CONTAINSTEXT operator', () => {
        const parsed = parseValue('attr', 'null');
        expect(parsed).toEqual({
            attr: 'attr',
            value: null,
            negate: false
        });
    });
    test('parses initial negation', () => {
        const parsed = parseValue('attr', '!blargh');
        expect(parsed).toEqual({
            attr: 'attr',
            value: 'blargh',
            negate: true
        });
    });
    test('parses OR list', () => {
        const parsed = parseValue('attr', 'blargh|monkeys');
        expect(parsed).toEqual({
            operator: OPERATORS.OR,
            comparisons: [
                {
                    attr: 'attr', value: 'blargh', negate: false
                },
                {
                    attr: 'attr', value: 'monkeys', negate: false
                }
            ]
        });
    });
    test('parses OR list with different operators', () => {
        const parsed = parseValue('attr', 'blargh|~monkeys');
        expect(parsed).toEqual({
            operator: OPERATORS.OR,
            comparisons: [
                {
                    attr: 'attr', value: 'blargh', negate: false
                },
                {
                    attr: 'attr', value: 'monkeys', operator: OPERATORS.CONTAINSTEXT, negate: false
                }
            ]
        });
    });
    test('parses OR list with some negatives', () => {
        const parsed = parseValue('attr', 'blargh|!monkeys');
        expect(parsed).toEqual({
            operator: OPERATORS.OR,
            comparisons: [
                {
                    attr: 'attr', value: 'blargh', negate: false
                },
                {
                    attr: 'attr', value: 'monkeys', negate: true
                }
            ]
        });
    });
});


describe('parseCompoundAttr', () => {
    test('parses edge.link.direct', () => {
        const parsed = parseCompoundAttr('outE.vertex.name');
        expect(parsed).toEqual({
            type: 'EDGE',
            direction: 'out',
            child: {
                attr: 'inV',
                type: 'LINK',
                child: {attr: 'name'}
            }
        });
    });
    test('parses edge with classes', () => {
        const parsed = parseCompoundAttr('out(ImpliedBy, supportedby).vertex.name');
        expect(parsed).toEqual({
            type: 'EDGE',
            direction: 'out',
            edges: ['ImpliedBy', 'supportedby'],
            child: {
                attr: 'inV',
                type: 'LINK',
                child: {attr: 'name'}
            }
        });
    });
    test('parses edge without classes', () => {
        const parsed = parseCompoundAttr('out().vertex.name');
        expect(parsed).toEqual({
            type: 'EDGE',
            direction: 'out',
            edges: [],
            child: {
                attr: 'inV',
                type: 'LINK',
                child: {attr: 'name'}
            }
        });
    });
    test('parses direct', () => {
        const parsed = parseCompoundAttr('name');
        expect(parsed).toEqual({
            attr: 'name'
        });
    });
    test('parses link.edge', () => {
        const parsed = parseCompoundAttr('source.out(ImpliedBy,supportedby)');
        expect(parsed).toEqual({
            attr: 'source',
            type: 'LINK',
            child: {
                type: 'EDGE',
                direction: 'out',
                edges: ['ImpliedBy', 'supportedby']
            }
        });
    });
    test('parses link.direct', () => {
        const parsed = parseCompoundAttr('source.name');
        expect(parsed).toEqual({
            type: 'LINK',
            attr: 'source',
            child: {
                attr: 'name'
            }
        });
    });
});


describe('parse', () => {
    test('no query parameters', () => {
        const qparams = qs.parse('');
        const result = parse(qparams);
        expect(result).toEqual({where: []});
    });
    test('neighbors', () => {

    });
    test.todo('errors on too many neighbors');
    test.todo('limit');
    test.todo('error on negative limit');
    test.todo('error on 0 limit');
    test.todo('error on limit too large');
    test.todo('skip');
    test.todo('error on negative skip');
    test('sourceId OR name', () => {
        const qparams = qs.parse('sourceId=blargh&name=monkeys&or=sourceId,name');
        const result = parse(qparams);
        expect(result).toEqual({
            where: [{
                operator: OPERATORS.OR,
                comparisons: [
                    {
                        attr: 'sourceId', value: 'blargh', negate: false
                    },
                    {
                        attr: 'name', value: 'monkeys', negate: false
                    }
                ]
            }]
        });
        expect(() => Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, result)).not.toThrow();
    });
    test('parse & validate', () => {
        const body = {
            where: [
                {
                    attr: 'inE(Impliedby).vertex.reference1.name',
                    value: 'KRAS'
                }
            ]
        };
        const query = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Statement, body);
        expect(() => query.validate()).not.toThrow();
    });
    test('similar attr names', () => {
        const qparams = qs.parse('source[name]=disease%20ontology&name=~pediat&neighbors=1');
        const result = parse(qparams);
        expect(result).toEqual({
            where: [
                {
                    attr: {attr: 'source', type: 'LINK', child: {attr: 'name'}},
                    value: 'disease ontology',
                    negate: false
                },
                {
                    attr: 'name',
                    operator: OPERATORS.CONTAINSTEXT,
                    value: 'pediat',
                    negate: false
                }
            ],
            neighbors: 1
        });
        const query = Query.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, result);
        const exp = new Query(
            'Disease',
            new Clause('AND', [
                new Comparison(
                    new Traversal({
                        type: TRAVERSAL_TYPE.LINK,
                        child: new Traversal({
                            attr: 'name',
                            property: SOURCE_PROPS.name
                        }),
                        attr: 'source',
                        property: DISEASE_PROPS.source
                    }),
                    'disease ontology'
                ),
                new Comparison(
                    new Traversal({attr: 'name', property: DISEASE_PROPS.name}),
                    'pediat',
                    OPERATORS.CONTAINSTEXT
                )
            ]),
            {neighbors: 1}
        );
        expect(query).toEqual(exp);
        const {query: sql, params} = query.toString();
        expect(sql).toBe(
            'SELECT * FROM (SELECT * FROM Disease WHERE source.name = :param0 AND name CONTAINSTEXT :param1) WHERE deletedAt IS NULL'
        );
        expect(params).toEqual({
            param0: 'disease ontology',
            param1: 'pediat'
        });
    });
    test('returnProperties', () => {
        const qparams = qs.parse('returnProperties=name,sourceId');
        const result = parse(qparams);
        expect(result).toEqual({
            where: [],
            returnProperties: ['name', 'sourceId']
        });
    });
});
