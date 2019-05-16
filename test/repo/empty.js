

const {
    create,
    update,
    remove,
    select,
    selectCounts
} = require('./../../app/repo/commands');
const {
    RecordExistsError, AttributeError
} = require('./../../app/repo/error');
const {
    setUpEmptyDB
} = require('./../util');
const {
    Query
} = require('./../../app/repo/query');

const {createConfig} = require('./../../app');

const TEST_TIMEOUT_MS = 50000;
jest.setTimeout(TEST_TIMEOUT_MS);

if (process.env.GKB_DBS_PASS) {
    describe('schema', () => {
        let db,
            schema,
            admin,
            doSource,
            otherVertex,
            server,
            dbName;
        beforeAll(async () => {
            ({
                db,
                schema,
                admin,
                server,
                dbName
            } = await setUpEmptyDB(createConfig()));
        });
        beforeEach(async () => {
            // create the source
            doSource = await create(db, {
                model: schema.Source,
                content: {
                    name: 'disease ontology'
                },
                user: admin
            });
            otherVertex = await create(db, {
                model: schema.Source,
                content: {
                    name: 'some other source'
                },
                user: admin
            });
        });
        afterEach(async () => {
            // clear all V/E records
            await db.query('delete edge e');
            await db.query('delete vertex v');
        });
        afterAll(async () => {
            if (server) {
                if (db && dbName) {
                    await server.drop({name: dbName});
                }
                await server.close();
            }
        });
        describe('create vertex', () => {
            test('error on source not specified', async () => {
                try {
                    const record = await create(db, {
                        model: schema.Disease,
                        content: {
                            sourceId: 'cancer'
                        },
                        user: admin
                    });
                    console.error(record);
                } catch (err) {
                    expect(err.message).toContain('missing required attribute source');
                    return;
                }
                expect.fail('did not throw the expected error');
            });
            test('create a new disease with source disease ontology', async () => {
                const record = await create(db, {
                    model: schema.Disease,
                    content: {
                        sourceId: 'cancer',
                        source: doSource
                    },
                    user: admin
                });
                expect(record).toHaveProperty('sourceId', 'cancer');
                expect(record.source).toEqual(doSource['@rid']);
            });
        });
        test('update vertex', async () => {
            // make the initial node
            const content = {
                sourceId: 'cancer',
                source: doSource['@rid'].toString()
            };
            const record = await create(db, {
                model: schema.Disease,
                content,
                user: admin
            });
            expect(record).toHaveProperty('sourceId', 'cancer');
            expect(record.source).toEqual(doSource['@rid']);
            // change the name
            const updated = await update(db, {
                schema,
                changes: {
                    sourceId: 'new name'
                },
                model: schema.Disease,
                user: admin,
                query: Query.parseRecord(schema, schema.Disease, content)
            });
            // check that a history link has been added to the node
            expect(updated).toHaveProperty('sourceId', 'new name');
            expect(record.source).toEqual(doSource['@rid']);
            // check that the 'old'/copy node has the original details
            expect(updated['@rid']).toEqual(record['@rid']);
            // select the original node
            let originalNode = await select(
                db,
                Query.parseRecord(
                    schema,
                    schema.Disease,
                    content,
                    {
                        activeOnly: false
                    }
                ),
                {fetchPlan: '*:1', exactlyN: 1}
            );
            originalNode = originalNode[0];
            expect(updated.history).toEqual(originalNode['@rid']);
            expect(originalNode.deletedBy['@rid']).toEqual(admin['@rid']);
            expect(updated.createdBy).toEqual(admin['@rid']);
        });
        test('get /stats group by class', async () => {
            const stats = await selectCounts(db, ['Source', 'User', 'UserGroup']);
            expect(stats).toEqual({
                Source: 2,
                User: 1,
                UserGroup: 3
            });
        });
        describe('create edge', () => {
            let src,
                tgt;
            beforeEach(async () => {
                src = await create(db, {
                    model: schema.Disease,
                    content: {
                        sourceId: 'cancer',
                        source: doSource
                    },
                    user: admin
                });
                tgt = await create(db, {
                    model: schema.Disease,
                    content: {
                        sourceId: 'carcinoma',
                        source: doSource
                    },
                    user: admin
                });
            });
            test('ok', async () => {
                const edge = await create(db, {
                    model: schema.AliasOf,
                    content: {
                        out: src,
                        in: tgt,
                        source: doSource
                    },
                    user: admin
                });
                expect(edge).toHaveProperty('source');
                expect(edge.source).toEqual(doSource['@rid']);
                expect(edge.out).toEqual(src['@rid']);
                expect(edge.in).toEqual(tgt['@rid']);
            });
            test('error on src = tgt', async () => {
                try {
                    await create(db, {
                        model: schema.AliasOf,
                        content: {
                            out: src,
                            in: src,
                            source: doSource
                        },
                        user: admin
                    });
                } catch (err) {
                    expect(err).toBeInstanceOf(AttributeError);
                    expect(err.message).toEqual(
                        expect.arrayContaining(['an edge cannot be used to relate a node/vertex to itself'])
                    );
                    return;
                }
                expect.fail('did not throw the expected error');
            });
            test('error on no src (out) vertex', async () => {
                try {
                    await create(db, {
                        model: schema.AliasOf,
                        content: {
                            out: null,
                            in: tgt,
                            source: doSource
                        },
                        user: admin
                    });
                } catch (err) {
                    expect(err).toBeInstanceOf(AttributeError);
                    expect(err.message).toContain('The out property cannot be null');
                    return;
                }
                expect.fail('did not throw the expected error');
            });
            test('error on no tgt (in) vertex', async () => {
                try {
                    await create(db, {
                        model: schema.AliasOf,
                        content: {
                            out: src,
                            in: null,
                            source: doSource
                        },
                        user: admin
                    });
                } catch (err) {
                    expect(err).toBeInstanceOf(AttributeError);
                    expect(err.message).toContain('The in property cannot be null');
                    return;
                }
                expect.fail('did not throw the expected error');
            });
            test('error on no source link given', async () => {
                try {
                    await create(db, {
                        model: schema.AliasOf,
                        content: {
                            out: src,
                            in: tgt
                        },
                        user: admin
                    });
                } catch (err) {
                    expect(err).toBeInstanceOf(AttributeError);
                    expect(err.message).toContain('[AliasOf] missing required attribute source');
                    return;
                }
                expect.fail('did not throw the expected error');
            });
        });
        test('"delete" edge', async () => {
        // create the initial edge
            const original = await create(db, {
                model: schema.AliasOf,
                content: {
                    out: doSource['@rid'],
                    in: otherVertex['@rid'],
                    comment: 'some original comment',
                    source: doSource['@rid']
                },
                user: admin
            });
            // now update the edge, both src and target node should have history after
            const result = await remove(db, {
                query: Query.parseRecord(schema, schema.AliasOf, {'@rid': original['@rid'].toString(), createdAt: original.createdAt}),
                user: admin,
                model: schema.AliasOf,
                schema
            });
            expect(result).toHaveProperty('deletedBy');
            expect(result.createdBy).toEqual(admin['@rid']);
            expect(result).toHaveProperty('deletedAt');
            expect(result.deletedAt).not.toBeNull();
            [otherVertex, doSource] = await db.record.get([otherVertex['@rid'], doSource['@rid']]);
            expect(result.out).toEqual(doSource.history);
            expect(result.in).toEqual(otherVertex.history);
        });
        test.todo('error on delete deleted vertex');
        test.todo('error on delete deleted edge');
        test('"delete" vertex (and connected edges)', async () => {
        // create an edge
            const edge = await create(db, {
                model: schema.AliasOf,
                content: {
                    out: doSource['@rid'],
                    in: otherVertex['@rid'],
                    comment: 'some original comment',
                    source: doSource['@rid']
                },
                user: admin
            });
            const result = await remove(db, {
                query: Query.parseRecord(schema, schema.Source, {'@rid': doSource['@rid'].toString(), createdAt: doSource.createdAt}),
                user: admin,
                model: schema.Source,
                schema
            });
            expect(result).toHaveProperty('deletedAt');
            expect(result).toHaveProperty('deletedBy');
            expect(result.deletedBy).toEqual(admin['@rid']);
            const updatedEdge = await db.record.get(edge['@rid']);
            expect(updatedEdge.in).not.toEqual(otherVertex['@rid']);
            expect(updatedEdge.deletedBy).toEqual(admin['@rid']);
        });
        describe('select', () => {
            let cancer,
                carcinoma;
            beforeEach(async () => {
                cancer = await create(db, {
                    model: schema.Disease,
                    content: {
                        sourceId: 'cancer',
                        source: doSource
                    },
                    user: admin
                });
                carcinoma = await create(db, {
                    model: schema.Disease,
                    content: {
                        sourceId: 'disease of cellular proliferation',
                        name: 'other name',
                        source: doSource
                    },
                    user: admin
                });
                await create(db, {
                    model: schema.AliasOf,
                    content: {
                        source: doSource,
                        out: carcinoma['@rid'],
                        in: cancer['@rid']
                    },
                    user: admin
                });
            });
            test('get by name OR sourceId', async () => {
                const records = await select(
                    db,
                    Query.parse(schema, schema.Disease, {
                        where: [{operator: 'OR', comparisons: [{attr: 'name', value: 'other name'}, {attr: 'sourceId', value: 'cancer'}]}]
                    }),
                    {user: admin}
                );
                expect(records).toHaveProperty('length', 2);
            });
            test('limit 1', async () => {
                const query = Query.parse(schema, schema.Disease, {
                    limit: 1,
                    orderBy: ['createdAt']
                });
                const records = await select(db, query, {user: admin});
                expect(records).toHaveProperty('length', 1);
                expect(records[0]).toHaveProperty('sourceId', 'cancer');
            });
            test('limit 1, skip 1', async () => {
                const query = Query.parse(schema, schema.Disease, {
                    limit: 1, skip: 1, orderBy: ['createdAt']
                });
                const records = await select(db, query, {user: admin});
                expect(records).toHaveProperty('length', 1);
                expect(records[0]).toHaveProperty('sourceId', 'disease of cellular proliferation');
            });
        });
        describe('statements', () => {
            let disease1,
                disease2,
                publication1,
                publication2,
                drug,
                relevance1,
                relevance2,
                level,
                source;
            beforeEach(async () => {
                source = doSource['@rid'];
                // add a disease and pubmed source
                [
                    disease1,
                    disease2,
                    drug,
                    relevance1,
                    relevance2,
                    level
                ] = await Promise.all(Array.from([{
                    model: schema.Disease,
                    user: admin,
                    content: {source, name: 'cancer', sourceId: 'DOID:123'}
                },
                {
                    model: schema.Disease,
                    user: admin,
                    content: {source, name: 'carcinoma', sourceId: 'DOID:124'}
                },
                {
                    content: {name: 'drug', sourceId: 'drug', source},
                    model: schema.Therapy,
                    user: admin
                },
                {
                    content: {name: 'sensitivity', sourceId: 'sensitivity', source},
                    model: schema.Vocabulary,
                    user: admin
                },
                {
                    content: {name: 'resistance', sourceId: 'resistance', source},
                    model: schema.Vocabulary,
                    user: admin
                },
                {
                    content: {name: '4a', sourceId: '4a', source},
                    model: schema.EvidenceLevel,
                    user: admin
                }], async x => create(db, x)));
                // add a publication
                [publication1, publication2] = await Promise.all(Array.from([
                    {
                        name: 'some article name',
                        sourceId: '123456',
                        year: 2017,
                        source
                    },
                    {
                        name: 'second article',
                        sourceId: '1234567',
                        year: 2018,
                        source
                    }], async content => create(db, {
                    model: schema.Publication, schema, user: admin, content
                })));
            });
            test('inserts related edges', async () => {
                await create(db, {
                    content: {
                        relevance: relevance1['@rid'],
                        appliesTo: drug['@rid'],
                        impliedBy: [{target: disease1['@rid']}],
                        supportedBy: [{target: publication1['@rid'], level}]
                    },
                    user: admin,
                    model: schema.Statement,
                    schema
                });
            });
            test('delete a statement', async () => {
                const stat = await create(db, {
                    content: {
                        relevance: relevance1['@rid'],
                        appliesTo: drug['@rid'],
                        impliedBy: [{target: disease1['@rid']}],
                        supportedBy: [{target: publication1['@rid'], level}]
                    },
                    user: admin,
                    model: schema.Statement,
                    schema
                });
                await remove(db, {
                    query: Query.parseRecord(schema, schema.Statement, {'@rid': stat['@rid']}),
                    user: admin,
                    model: schema.Statement
                });
                const statements = await select(
                    db,
                    Query.parseRecord(schema, schema.Statement, {'@rid': stat['@rid']}, {activeOnly: true})
                );
                expect(statements).toHaveProperty('length', 0);
            });
            test('update the review status', async () => {
                const stat = await create(db, {
                    content: {
                        relevance: relevance1['@rid'],
                        appliesTo: drug['@rid'],
                        impliedBy: [{target: disease1['@rid']}],
                        supportedBy: [{target: publication1['@rid'], level}]
                    },
                    user: admin,
                    model: schema.Statement,
                    schema
                });
                await update(db, {
                    query: Query.parseRecord(schema, schema.Statement, {'@rid': stat['@rid']}),
                    changes: {reviewStatus: 'passed'},
                    user: admin,
                    model: schema.Statement
                });
                const statements = await select(
                    db,
                    Query.parseRecord(schema, schema.Statement, {createdAt: stat.createdAt}, {activeOnly: true})
                );
                expect(statements).toHaveProperty('length', 0);
            });
            test('error on existing statement', async () => {
                await create(db, {
                    content: {
                        relevance: relevance1['@rid'],
                        appliesTo: drug['@rid'],
                        impliedBy: [{target: disease1['@rid']}],
                        supportedBy: [{target: publication1['@rid'], level}]
                    },
                    user: admin,
                    model: schema.Statement,
                    schema
                });
                try {
                    await create(db, {
                        content: {
                            relevance: relevance1['@rid'],
                            appliesTo: drug['@rid'],
                            impliedBy: [{target: disease1['@rid']}],
                            supportedBy: [{target: publication1['@rid'], level}]
                        },
                        user: admin,
                        model: schema.Statement,
                        schema
                    });
                } catch (err) {
                    expect(err).toBeInstanceOf(RecordExistsError);
                    expect(err.message).toContain('already exists');
                    return;
                }
                expect.fail('did not throw the expected error');
            });
            test('allows statement with only some shared edges', async () => {
                await create(db, {
                    content: {
                        relevance: relevance1['@rid'],
                        appliesTo: drug['@rid'],
                        impliedBy: [{target: disease1['@rid']}],
                        supportedBy: [{target: publication1['@rid'], level}]
                    },
                    user: admin,
                    model: schema.Statement,
                    schema
                });
                await create(db, {
                    content: {
                        relevance: relevance1['@rid'],
                        appliesTo: drug['@rid'],
                        impliedBy: [{target: disease1['@rid']}, {target: disease2['@rid']}],
                        supportedBy: [{target: publication1['@rid'], level}]
                    },
                    user: admin,
                    model: schema.Statement,
                    schema
                });
            });
            test('create statment with null appliesTo', async () => {
                const statement = await create(db, {
                    content: {
                        relevance: relevance1['@rid'],
                        appliesTo: null,
                        impliedBy: [{target: disease1['@rid']}],
                        supportedBy: [{target: publication1['@rid'], level}]
                    },
                    user: admin,
                    model: schema.Statement,
                    schema
                });
                expect(statement).toHaveProperty('appliesTo', null);
            });
            describe('query', () => {
                let relevance3;
                beforeEach(async () => {
                    relevance3 = await create(db, {
                        model: schema.Vocabulary,
                        content: {
                            name: 'other',
                            sourceId: 'other',
                            source
                        },
                        user: admin
                    });
                    await Promise.all(Array.from([
                        {
                            model: schema.AliasOf,
                            content: {out: relevance1['@rid'], in: relevance2['@rid'], source}
                        },
                        {
                            model: schema.DeprecatedBy,
                            content: {out: publication1['@rid'], in: publication2['@rid'], source}
                        },
                        {
                            content: {
                                relevance: relevance1['@rid'],
                                appliesTo: drug['@rid'],
                                impliedBy: [{target: disease1['@rid']}],
                                supportedBy: [{target: publication1['@rid'], level}]
                            },
                            model: schema.Statement
                        },
                        {
                            content: {
                                relevance: relevance2['@rid'],
                                appliesTo: drug['@rid'],
                                impliedBy: [{target: disease1['@rid']}, {target: disease2['@rid']}],
                                supportedBy: [{target: publication1['@rid'], level}]
                            },
                            model: schema.Statement
                        },
                        {
                            content: {
                                relevance: relevance3['@rid'],
                                appliesTo: drug['@rid'],
                                impliedBy: [{target: disease1['@rid']}, {target: disease2['@rid']}],
                                supportedBy: [{target: publication2['@rid']}]
                            },
                            model: schema.Statement
                        }
                    ], async opt => create(db, Object.assign({schema, user: admin}, opt))));
                });
                test('select on related edge properties', async () => {
                    const query = Query.parse(
                        schema,
                        schema.Statement,
                        {
                            where: [
                                {
                                    attr: {
                                        type: 'EDGE',
                                        edges: ['SupportedBy'],
                                        child: {
                                            attr: 'level', type: 'LINK', child: 'name'
                                        },
                                        direction: 'out'
                                    },
                                    value: level.name
                                }
                            ]
                        }
                    );
                    const recordList = await select(db, query);
                    expect(recordList).toHaveProperty('length', 2);
                });
                test('select on related uni-directional edge properties', async () => {
                    const query = Query.parse(
                        schema,
                        schema.Statement,
                        {
                            where: [
                                {
                                    attr: {
                                        type: 'EDGE',
                                        edges: ['SupportedBy'],
                                        child: {
                                            type: 'LINK', child: 'name', attr: 'level'
                                        },
                                        direction: 'both'
                                    },
                                    value: level.name
                                }
                            ]
                        }
                    );
                    const recordList = await select(db, query);
                    expect(recordList).toHaveProperty('length', 2);
                });
            });
        });
    });
} else {
    describe.skip('schema');
}
