const { types } = require('orientjs');

const {
    splitSchemaClassLevels,
    SCHEMA_DEFN,
} = require('./../../app/repo/schema');
const {
    ClassModel,
    Property,
} = require('./../../app/repo/model');


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
                    reference2: '#33:1',
                    break1Start: { '@class': 'ProteinPosition', pos: 1 },
                    type: '#33:2',
                    createdBy: '#44:1',
                }, { addDefaults: true });
            }).toThrow('missing required attribute');
        });

        test('error on missing break1Start', () => {
            expect(() => {
                const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                    reference1: '#33:1',
                    break2Start: { '@class': 'ProteinPosition', pos: 1, refAA: 'A' },
                    type: '#33:2',
                    createdBy: '#44:1',
                }, { addDefaults: true });
                console.error(formatted);
            }).toThrow('missing required attribute');
        });

        test('error on position without @class attribute', () => {
            expect(() => {
                const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                    reference1: '#33:1',
                    break1Start: { pos: 1, refAA: 'A' },
                    type: '#33:2',
                    createdBy: '#44:1',
                }, { addDefaults: true });
                console.error(formatted);
            }).toThrow('positions must include the @class attribute');
        });

        test('error on break2End without break2Start', () => {
            expect(() => {
                const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                    reference1: '#33:1',
                    break1Start: { '@class': 'ProteinPosition', pos: 1, refAA: 'A' },
                    type: '#33:2',
                    break2End: { '@class': 'ProteinPosition', pos: 10, refAA: 'B' },
                    createdBy: '#44:1',
                }, { addDefaults: true });
                console.error(formatted);
            }).toThrow('both start and end');
        });

        test('auto generates the breakRepr', () => {
            const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                reference1: '#33:1',
                type: '#33:2',
                createdBy: '#44:1',
                break1Start: { '@class': 'ProteinPosition', pos: 1, refAA: 'A' },
                break2Start: { '@class': 'ExonicPosition', pos: 1 },
                break2End: { '@class': 'ExonicPosition', pos: 3 },
            }, { addDefaults: true });
            expect(formatted).toHaveProperty('break1Repr', 'p.A1');
            expect(formatted).toHaveProperty('break2Repr', 'e.(1_3)');
        });

        test('ignores the input breakrepr if given', () => {
            const formatted = SCHEMA_DEFN.PositionalVariant.formatRecord({
                reference1: '#33:1',
                type: '#33:2',
                createdBy: '#44:1',
                break1Start: { '@class': 'ProteinPosition', pos: 1, refAA: 'A' },
                break1Repr: 'bad',
            }, { addDefaults: true });
            expect(formatted).toHaveProperty('break1Repr', 'p.A1');
        });
    });
});


describe('ClassModel', () => {
    describe('compareToDbClass', () => {
        const model = new ClassModel({
            name: 'Pathway',
            inherits: [{ name: 'Ontology' }],
            properties: { prop1: new Property({ name: 'prop1', type: 'string' }) },
        });

        test('error on abstract mismatch', () => {
            expect(() => {
                ClassModel.compareToDbClass(model, {
                    name: 'Pathway',
                    shortName: null,
                    defaultClusterId: -1,
                    properties: [{ name: 'prop1', type: OJS_TYPES.string }],
                    superClass: 'Ontology',
                }, {});
            }).toThrow('does not match the database definition');
        });

        test('error on undefined property', () => {
            expect(() => {
                ClassModel.compareToDbClass(model, {
                    name: 'Pathway',
                    shortName: null,
                    defaultClusterId: 65,
                    properties: [{ name: 'prop2' }],
                    superClass: 'Ontology',
                }, {});
            }).toThrow('failed to find the property');
        });

        test('error on wrong property type', () => {
            expect(() => {
                ClassModel.compareToDbClass(model, {
                    name: 'Pathway',
                    shortName: null,
                    defaultClusterId: 65,
                    properties: [{ name: 'prop1', type: OJS_TYPES.integer }],
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
            const model = new ClassModel({ name: 'edge', isEdge: true });
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
        const parent = new ClassModel({ name: 'parent', subclasses: [child], properties: {} });
        const grandparent = new ClassModel({
            name: 'grandparent',
            subclasses: [parent],
            properties: { grandProp: { name: 'grandProp' } },
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
                gender: { name: 'gender', default: 'not specified' },
                name: { name: 'name', mandatory: true },
            },
        });
        const child = new ClassModel({
            name: 'child',
            properties: {
                mom: { name: 'mom', mandatory: true, cast: x => x.toLowerCase() },
                age: { name: 'age' },
            },
            inherits: [person],
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
                    req1: new Property({
                        name: 'req1', mandatory: true, nonEmpty: true, type: 'string',
                    }),
                    req2: new Property({
                        name: 'req2', mandatory: true, default: 1, type: 'integer',
                    }),
                    opt1: new Property({ name: 'opt1' }),
                    opt2: new Property({
                        name: 'opt2', choices: [2, 3], nullable: true, default: 2, type: 'integer',
                    }),
                },
            });
        });

        test('error on empty string', () => {
            expect(() => {
                model.formatRecord({
                    req1: '',
                }, { dropExtra: false, addDefaults: true });
            }).toThrow();
        });

        test('errors on un-cast-able input', () => {
            expect(() => {
                model.formatRecord({
                    req1: 2,
                    req2: 'f45',
                }, { dropExtra: false, addDefaults: true });
            }).toThrow();
        });

        test('errors on un-expected attr', () => {
            expect(() => {
                model.formatRecord({
                    req1: 2,
                    req2: 1,
                    badAttr: 3,
                }, { dropExtra: false, ignoreExtra: false, addDefaults: false });
            }).toThrow();
        });

        test('adds defaults', () => {
            const record = model.formatRecord({
                req1: 'term1',
            }, { dropExtra: false, addDefaults: true });
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
                        name: 'thing',
                        type: 'embeddedset',
                        cast: x => x.toLowerCase().trim(),
                    }),
                },
            });
            const record = model.formatRecord({
                thing: ['aThinNG', 'another THING'],
            }, { dropExtra: false, addDefaults: true });
            expect(record).toHaveProperty('thing');
            expect(record.thing).toEqual(['athinng', 'another thing']);
        });

        test('cast inheritied embedded types', () => {
            model = new ClassModel({
                name: 'example',
                properties: {
                    thing: new Property({
                        name: 'thing',
                        type: 'embeddedset',
                        cast: x => x.toLowerCase().trim(),
                    }),
                },
            });
            const childModel = new ClassModel({
                name: 'child',
                inherits: [model],
            });
            const record = childModel.formatRecord({
                thing: ['aThinNG', 'another THING'],
            }, { dropExtra: false, addDefaults: true });
            expect(record).toHaveProperty('thing');
            expect(record.thing).toEqual(['athinng', 'another thing']);
        });

        test('does not add defaults', () => {
            expect(() => {
                model.formatRecord({
                    req1: 'term1',
                }, { dropExtra: false, addDefaults: false });
            }).toThrow();

            const record = model.formatRecord({
                req1: 'term1', req2: '4',
            }, { dropExtra: false, addDefaults: false });
            expect(record).toHaveProperty('req1', 'term1');
            expect(record).toHaveProperty('req2', 4);
            expect(record).not.toHaveProperty('opt2');
            expect(record).not.toHaveProperty('opt1');
        });

        test('allows optional parameters', () => {
            const record = model.formatRecord({
                req1: 'term1', req2: '2', opt1: '2',
            }, { dropExtra: false, addDefaults: false });
            expect(record).toHaveProperty('req1', 'term1');
            expect(record).toHaveProperty('req2', 2);
            expect(record).toHaveProperty('opt1', '2');
            expect(record).not.toHaveProperty('opt2');
        });

        test('error on invalid enum choice', () => {
            expect(() => {
                model.formatRecord({
                    req1: 'term1', opt2: 4, req2: 1,
                }, { dropExtra: false, addDefaults: false });
            }).toThrow('Violated the choices constraint of opt2');
        });

        test('allow nullable enum', () => {
            const record = model.formatRecord({
                req1: 'term1', opt2: null, req2: 1,
            }, { dropExtra: false, addDefaults: false });
            expect(record).toHaveProperty('req1', 'term1');
            expect(record).toHaveProperty('opt2', null);
        });
    });
});
