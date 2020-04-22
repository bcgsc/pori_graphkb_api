const { types } = require('orientjs');

const {
    splitSchemaClassLevels,
    SCHEMA_DEFN,
} = require('../../src/repo/schema');
const {
    ClassModel,
    Property,
} = require('../../src/repo/model');


const OJS_TYPES = {};

for (const num of Object.keys(types)) {
    const name = types[num].toLowerCase();
    OJS_TYPES[name] = num;
}


describe('splitSchemaClassLevels', () => {
    test('splits dependency chain', () => {
        const schema = {
            grandparent: new ClassModel({ name: 'grandparent' }),
            other: new ClassModel({ name: 'other' }),
        };
        schema.parent = new ClassModel({
            inherits: [schema.grandparent],
            name: 'parent',
            properties: { prop1: new Property({ linkedClass: schema.other, name: 'prop1' }) },
        });
        schema.child = new ClassModel({
            inherits: [schema.grandparent],
            properties: { child: new Property({ linkedClass: schema.parent, name: 'child' }) },
        });
        schema.grandparent._subclasses = [schema.parent, schema.child];
        const levels = splitSchemaClassLevels(schema);
        expect(levels).toHaveProperty('length', 3);
    });
});


describe('SCHEMA', () => {
    describe('PositionalVariant.formatRecord', () => {
        test('error on missing reference1', () => {
            expect(() => {
                SCHEMA_DEFN.PositionalVariant.formatRecord({
                    break1Start: { '@class': 'ProteinPosition', pos: 1 },
                    createdBy: '#44:1',
                    reference2: '#33:1',
                    type: '#33:2',
                }, { addDefaults: true });
            }).toThrow('missing required attribute');
        });

        test('error on missing break1Start', () => {
            expect(() => {
                const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                    break2Start: { '@class': 'ProteinPosition', pos: 1, refAA: 'A' },
                    createdBy: '#44:1',
                    reference1: '#33:1',
                    type: '#33:2',
                }, { addDefaults: true });
                console.error(formatted);
            }).toThrow('missing required attribute');
        });

        test('error on position without @class attribute', () => {
            expect(() => {
                const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                    break1Start: { pos: 1, refAA: 'A' },
                    createdBy: '#44:1',
                    reference1: '#33:1',
                    type: '#33:2',
                }, { addDefaults: true });
                console.error(formatted);
            }).toThrow('positions must include the @class attribute');
        });

        test('error on break2End without break2Start', () => {
            expect(() => {
                const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                    break1Start: { '@class': 'ProteinPosition', pos: 1, refAA: 'A' },
                    break2End: { '@class': 'ProteinPosition', pos: 10, refAA: 'B' },
                    createdBy: '#44:1',
                    reference1: '#33:1',
                    type: '#33:2',
                }, { addDefaults: true });
                console.error(formatted);
            }).toThrow('both start and end');
        });

        test('auto generates the breakRepr', () => {
            const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                break1Start: { '@class': 'ProteinPosition', pos: 1, refAA: 'A' },
                break2End: { '@class': 'ExonicPosition', pos: 3 },
                break2Start: { '@class': 'ExonicPosition', pos: 1 },
                createdBy: '#44:1',
                reference1: '#33:1',
                type: '#33:2',
            }, { addDefaults: true });
            expect(formatted).toHaveProperty('break1Repr', 'p.A1');
            expect(formatted).toHaveProperty('break2Repr', 'e.(1_3)');
        });

        test('ignores the input breakrepr if given', () => {
            const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                break1Repr: 'bad',
                break1Start: { '@class': 'ProteinPosition', pos: 1, refAA: 'A' },
                createdBy: '#44:1',
                reference1: '#33:1',
                type: '#33:2',
            }, { addDefaults: true });
            expect(formatted).toHaveProperty('break1Repr', 'p.A1');
        });
    });
});


describe('ClassModel', () => {
    describe('compareToDbClass', () => {
        const model = new ClassModel({
            inherits: [{ name: 'Ontology' }],
            name: 'Pathway',
            properties: { prop1: new Property({ name: 'prop1', type: 'string' }) },
        });

        test('error on abstract mismatch', () => {
            expect(() => {
                ClassModel.compareToDbClass(model, {
                    defaultClusterId: -1,
                    name: 'Pathway',
                    properties: [{ name: 'prop1', type: OJS_TYPES.string }],
                    shortName: null,
                    superClass: 'Ontology',
                }, {});
            }).toThrow('does not match the database definition');
        });

        test('error on undefined property', () => {
            expect(() => {
                ClassModel.compareToDbClass(model, {
                    defaultClusterId: 65,
                    name: 'Pathway',
                    properties: [{ name: 'prop2' }],
                    shortName: null,
                    superClass: 'Ontology',
                }, {});
            }).toThrow('failed to find the property');
        });

        test('error on wrong property type', () => {
            expect(() => {
                ClassModel.compareToDbClass(model, {
                    defaultClusterId: 65,
                    name: 'Pathway',
                    properties: [{ name: 'prop1', type: OJS_TYPES.integer }],
                    shortName: null,
                    superClass: 'Ontology',
                }, {});
            }).toThrow('does not match the type');
        });
    });

    describe('routeName', () => {
        test('does not alter ary suffix', () => {
            const model = new ClassModel({ name: 'vocabulary' });
            expect(model.routeName).toBe('/vocabulary');
        });

        test('does not alter edge class names', () => {
            const model = new ClassModel({ isEdge: true, name: 'edge' });
            expect(model.routeName).toBe('/edge');
        });

        test('changes ys to ies', () => {
            const model = new ClassModel({ name: 'ontology' });
            expect(model.routeName).toBe('/ontologies');
        });

        test('adds s to regular class names', () => {
            const model = new ClassModel({ name: 'statement' });
            expect(model.routeName).toBe('/statements');
        });
    });

    describe('subclassModel', () => {
        const child = new ClassModel({ name: 'child' });
        const parent = new ClassModel({ name: 'parent', subclasses: [child] });
        const grandparent = new ClassModel({ name: 'grandparent', subclasses: [parent] });

        test('errors when the class does not exist', () => {
            expect(() => {
                grandparent.subClassModel('badName');
            }).toThrow('was not found as a subclass');
        });

        test('returns an immeadiate subclass', () => {
            expect(parent.subClassModel('child')).toEqual(child);
        });

        test('returns a subclass of a subclass recursively', () => {
            expect(grandparent.subClassModel('child')).toEqual(child);
        });
    });

    describe('queryProperties', () => {
        const child = new ClassModel({
            name: 'child',
            properties: { childProp: { name: 'childProp' } },
        });
        const parent = new ClassModel({ name: 'parent', properties: {}, subclasses: [child] });
        const grandparent = new ClassModel({
            name: 'grandparent',
            properties: { grandProp: { name: 'grandProp' } },
            subclasses: [parent],
        });

        test('fetches grandfathered properties', () => {
            const queryProp = grandparent.queryProperties;
            expect(queryProp).toHaveProperty('childProp');
            expect(queryProp).toHaveProperty('grandProp');
        });

        test('ok when no subclasses', () => {
            const queryProp = child.queryProperties;
            expect(Object.keys(queryProp)).toEqual(['childProp']);
        });
    });

    describe('inheritance', () => {
        const person = new ClassModel({
            name: 'person',
            properties: {
                gender: { default: 'not specified', name: 'gender' },
                name: { mandatory: true, name: 'name' },
            },
        });
        const child = new ClassModel({
            inherits: [person],
            name: 'child',
            properties: {
                age: { name: 'age' },
                mom: { cast: x => x.toLowerCase(), mandatory: true, name: 'mom' },
            },
            sourceModel: true,
        });

        test('child required returns person attr', () => {
            expect(person.required).toEqual(['name']);
            expect(child.required).toEqual(['mom', 'name']);
        });

        test('child optional returns person attr', () => {
            expect(person.optional).toEqual(['gender']);
            expect(child.optional).toEqual(['age', 'gender']);
        });

        test('inherits to return list of strings', () => {
            expect(person.inherits).toEqual([]);
            expect(child.inherits).toEqual([person.name]);
        });

        test('is not an edge', () => {
            expect(person.isEdge).toBe(false);
            expect(child.isEdge).toBe(true);
        });
    });

    describe('formatRecord', () => {
        let model;

        beforeEach(() => {
            model = new ClassModel({
                name: 'example',
                properties: {
                    opt1: new Property({ name: 'opt1' }),
                    opt2: new Property({
                        choices: [2, 3], default: 2, name: 'opt2', nullable: true, type: 'integer',
                    }),
                    req1: new Property({
                        mandatory: true, name: 'req1', nonEmpty: true, type: 'string',
                    }),
                    req2: new Property({
                        default: 1, mandatory: true, name: 'req2', type: 'integer',
                    }),
                },
            });
        });

        test('error on empty string', () => {
            expect(() => {
                model.formatRecord({
                    req1: '',
                }, { addDefaults: true, dropExtra: false });
            }).toThrow();
        });

        test('errors on un-cast-able input', () => {
            expect(() => {
                model.formatRecord({
                    req1: 2,
                    req2: 'f45',
                }, { addDefaults: true, dropExtra: false });
            }).toThrow();
        });

        test('errors on un-expected attr', () => {
            expect(() => {
                model.formatRecord({
                    badAttr: 3,
                    req1: 2,
                    req2: 1,
                }, { addDefaults: false, dropExtra: false, ignoreExtra: false });
            }).toThrow();
        });

        test('adds defaults', () => {
            const record = model.formatRecord({
                req1: 'term1',
            }, { addDefaults: true, dropExtra: false });
            expect(record).toHaveProperty('req1', 'term1');
            expect(record).toHaveProperty('req2', 1);
            expect(record).toHaveProperty('opt2', 2);
            expect(record).not.toHaveProperty('opt1');
        });

        test('cast embedded types', () => {
            model = new ClassModel({
                name: 'example',
                properties: {
                    thing: new Property({
                        cast: x => x.toLowerCase().trim(),
                        name: 'thing',
                        type: 'embeddedset',
                    }),
                },
            });
            const record = model.formatRecord({
                thing: ['aThinNG', 'another THING'],
            }, { addDefaults: true, dropExtra: false });
            expect(record).toHaveProperty('thing');
            expect(record.thing).toEqual(['athinng', 'another thing']);
        });

        test('cast inheritied embedded types', () => {
            model = new ClassModel({
                name: 'example',
                properties: {
                    thing: new Property({
                        cast: x => x.toLowerCase().trim(),
                        name: 'thing',
                        type: 'embeddedset',
                    }),
                },
            });
            const childModel = new ClassModel({
                inherits: [model],
                name: 'child',
            });
            const record = childModel.formatRecord({
                thing: ['aThinNG', 'another THING'],
            }, { addDefaults: true, dropExtra: false });
            expect(record).toHaveProperty('thing');
            expect(record.thing).toEqual(['athinng', 'another thing']);
        });

        test('does not add defaults', () => {
            expect(() => {
                model.formatRecord({
                    req1: 'term1',
                }, { addDefaults: false, dropExtra: false });
            }).toThrow();

            const record = model.formatRecord({
                req1: 'term1', req2: '4',
            }, { addDefaults: false, dropExtra: false });
            expect(record).toHaveProperty('req1', 'term1');
            expect(record).toHaveProperty('req2', 4);
            expect(record).not.toHaveProperty('opt2');
            expect(record).not.toHaveProperty('opt1');
        });

        test('allows optional parameters', () => {
            const record = model.formatRecord({
                opt1: '2', req1: 'term1', req2: '2',
            }, { addDefaults: false, dropExtra: false });
            expect(record).toHaveProperty('req1', 'term1');
            expect(record).toHaveProperty('req2', 2);
            expect(record).toHaveProperty('opt1', '2');
            expect(record).not.toHaveProperty('opt2');
        });

        test('error on invalid enum choice', () => {
            expect(() => {
                model.formatRecord({
                    opt2: 4, req1: 'term1', req2: 1,
                }, { addDefaults: false, dropExtra: false });
            }).toThrow('Violated the choices constraint of opt2');
        });

        test('allow nullable enum', () => {
            const record = model.formatRecord({
                opt2: null, req1: 'term1', req2: 1,
            }, { addDefaults: false, dropExtra: false });
            expect(record).toHaveProperty('req1', 'term1');
            expect(record).toHaveProperty('opt2', null);
        });
    });
});
