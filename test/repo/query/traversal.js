const {
    util: {
        castDecimalInteger, castToRID
    }, schema: SCHEMA_DEFN
} = require('@bcgsc/knowledgebase-schema');

const {Traversal, constants: {TRAVERSAL_TYPE}} = require('./../../../app/repo/query');

const DISEASE_PROPS = SCHEMA_DEFN.Disease.queryProperties;
const ALL_PROPS = Object.assign(SCHEMA_DEFN.E.queryProperties, SCHEMA_DEFN.V.queryProperties);
const EVIDENCE_LEVEL = SCHEMA_DEFN.EvidenceLevel.queryProperties;


describe('Traversal', () => {
    describe('parse & toString', () => {
        test('direct', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, 'name');
            const exp = new Traversal({attr: 'name', property: DISEASE_PROPS.name});
            expect(parsed).toEqual(exp);
            expect(parsed.toString()).toBe('name');
        });
        test('link', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.LINK,
                attr: 'name'
            });
            const exp = new Traversal({type: TRAVERSAL_TYPE.DIRECT, attr: 'name', property: DISEASE_PROPS.name});
            expect(parsed).toEqual(exp);
            expect(parsed.toString()).toBe('name');
        });
        test('edge', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE
            });
            const exp = new Traversal({type: TRAVERSAL_TYPE.EDGE, cast: castToRID});
            expect(parsed).toEqual(exp);
            expect(parsed.toString()).toBe('bothE()');
        });
        test('edge with classes', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                edges: ['ImpliedBy', 'SupportedBy']
            });
            const exp = new Traversal({
                type: TRAVERSAL_TYPE.EDGE,
                cast: castToRID,
                edges: ['ImpliedBy', 'SupportedBy']
            });
            expect(parsed).toEqual(exp);
            expect(parsed.toString()).toBe('bothE(\'ImpliedBy\', \'SupportedBy\')');
        });
        test('edge with classes and direction', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                edges: ['ImpliedBy', 'SupportedBy'],
                direction: 'out'
            });
            const exp = new Traversal({
                type: TRAVERSAL_TYPE.EDGE,
                cast: castToRID,
                edges: ['ImpliedBy', 'SupportedBy'],
                direction: 'out'
            });
            expect(parsed).toEqual(exp);
            expect(parsed.toString()).toBe('outE(\'ImpliedBy\', \'SupportedBy\')');
        });
        test('edge with direction', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in'
            });
            const exp = new Traversal({
                type: TRAVERSAL_TYPE.EDGE,
                cast: castToRID,
                direction: 'in'
            });
            expect(parsed).toEqual(exp);
            expect(parsed.toString()).toBe('inE()');
        });
        test('edge.direct', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                child: 'name'
            });
            const exp = new Traversal({
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                child: new Traversal({attr: 'name', property: ALL_PROPS.name})
            });
            expect(parsed).toEqual(exp);
            expect(parsed.toString()).toBe('inE().name');
        });
        test('edge.link.direct', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                child: {
                    type: TRAVERSAL_TYPE.LINK,
                    attr: 'level',
                    child: 'name'
                }
            });
            const exp = new Traversal({
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                cast: castToRID,
                child: new Traversal({
                    attr: 'level',
                    type: TRAVERSAL_TYPE.LINK,
                    property: ALL_PROPS.level,
                    child: new Traversal({attr: 'name', property: EVIDENCE_LEVEL.name})
                })
            });
            expect(parsed).toEqual(exp);
            expect(parsed.toString()).toBe('inE().level.name');
        });
        test('edge.outV.direct', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                child: {
                    type: TRAVERSAL_TYPE.LINK,
                    attr: 'outV',
                    child: 'name'
                }
            });
            const exp = new Traversal({
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                child: new Traversal({
                    attr: 'outV()',
                    type: TRAVERSAL_TYPE.LINK,
                    cast: castToRID,
                    child: new Traversal({attr: 'name', property: ALL_PROPS.name})
                })
            });

            expect(parsed).toEqual(exp);
            expect(parsed.toString()).toBe('inE().outV().name');
        });
        test('edge.size()', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                child: 'size()'
            });
            const exp = new Traversal({
                type: TRAVERSAL_TYPE.EDGE,
                direction: 'in',
                child: new Traversal({
                    attr: 'size()',
                    cast: castDecimalInteger
                })
            });

            expect(parsed).toEqual(exp);
            expect(parsed.toString()).toBe('inE().size()');
        });
        test('attributes post edges', () => {
            const parsed = Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {
                type: TRAVERSAL_TYPE.EDGE,
                edges: ['ImpliedBy'],
                direction: 'out',
                child: {
                    attr: 'inV',
                    child: {
                        attr: 'reference1',
                        child: 'name'
                    }
                }
            });
            const exp = new Traversal({
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
            });
            expect(parsed.toString()).toEqual(exp.toString());
            expect(parsed.toString()).toBe('outE(\'ImpliedBy\').inV().reference1.name');
        });
        test('error on attr for edge', () => {
            expect(() => {
                Traversal.parse(SCHEMA_DEFN, null, {attr: 'edge', type: TRAVERSAL_TYPE.EDGE, child: null});
            }).toThrowError('do not require the attr');
        });
        test('error on invalid edge name', () => {
            expect(() => {
                Traversal.parse(SCHEMA_DEFN, null, {type: TRAVERSAL_TYPE.EDGE, edges: ['blarghHasMonkey']});
            }).toThrowError('Invalid Edge');
        });
        test('error on invalid direction', () => {
            expect(() => {
                Traversal.parse(SCHEMA_DEFN, null, {type: TRAVERSAL_TYPE.EDGE, direction: 'blargh'});
            }).toThrowError('Invalid direction');
        });
        test('error on link missing attr', () => {
            expect(() => {
                Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {type: TRAVERSAL_TYPE.LINK, child: {}});
            }).toThrowError('attr is a required property');
        });
        test('error on link bad traversal', () => {
            expect(() => {
                Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {type: TRAVERSAL_TYPE.LINK, attr: 'name', child: {}});
            }).toThrowError('does not have a linkedClass');
        });
        test('bad property link', () => {
            expect(() => {
                Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {type: TRAVERSAL_TYPE.LINK, attr: 'blargh', child: {}});
            }).toThrowError('has no definition');
        });
        test('bad direct property', () => {
            expect(() => {
                Traversal.parse(SCHEMA_DEFN, SCHEMA_DEFN.Disease, {attr: 'blargh'});
            }).toThrowError('has no property');
        });
    });
    describe('terminalProperty', () => {
        test('returns the current property for barren traversal', () => {
            const traversal = new Traversal({attr: 'name', property: 'thing'});
            expect(traversal.terminalProperty()).toBe('thing');
        });
        test('returns the nested property', () => {
            const traversal = new Traversal({attr: 'name', property: 'thing', child: new Traversal({property: 'thing2', child: 'thing3'})});
            expect(traversal.terminalProperty()).toBeNull();
        });
    });
    describe('terminalCast', () => {
        test('returns the current property for barren traversal', () => {
            const traversal = new Traversal({attr: 'name', cast: 'thing'});
            expect(traversal.terminalCast()).toBe('thing');
        });
        test('returns the nested property', () => {
            const traversal = new Traversal({attr: 'name', cast: 'thing', child: new Traversal({cast: 'thing2', child: 'thing3'})});
            expect(traversal.terminalCast()).toBeNull();
        });
    });
});
