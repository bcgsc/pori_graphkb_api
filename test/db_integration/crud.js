const {schema: {schema}} = require('@bcgsc/knowledgebase-schema');

const {
    create,
    update,
    remove,
    select
} = require('../../app/repo/commands');
const {
    RecordExistsError, AttributeError, NotImplementedError
} = require('../../app/repo/error');
const {
    parseRecord
} = require('../../app/repo/query_builder');


const {clearDB, createEmptyDb, tearDownDb} = require('./util');


const TEST_TIMEOUT_MS = 100000;
jest.setTimeout(TEST_TIMEOUT_MS);

const describeWithAuth = process.env.GKB_DBS_PASS
    ? describe
    : describe.skip;

if (!process.env.GKB_DBS_PASS) {
    console.warn('Cannot run tests without database password (GKB_DBS_PASS)');
}

describeWithAuth('CRUD operations', () => {
    let db,
        session;
    beforeAll(async () => {
        db = await createEmptyDb();
        session = await db.pool.acquire();
    });
    afterAll(async () => {
        await session.close();
        await tearDownDb(db);
        await db.pool.close();
        await db.server.close();
    });
    afterEach(async () => {
        await clearDB({session, admin: db.admin});
    });

    test('update error on missing changes argument', async () => {
        try {
            await update(session, {query: {}, user: db.admin, model: schema.User});
        } catch (err) {
            expect(err.message).toContain('opt.changes is a required argument');
            return;
        }
        throw new Error('Did not throw expected error');
    });

    describe('permisions error', () => {
        test.todo('cannot create class');
        test.todo('cannot update class');
        test.todo('cannot delete class');
        test.todo('protected record');
    });

    describe('user', () => {
        describe('create new', () => {
            test('ok', async () => {
                const record = await create(session, {content: {name: 'alice'}, model: schema.User, user: db.admin});
                expect(record).toHaveProperty('name', 'alice');
            });
            test('error on duplicate name', async () => {
                await create(session, {content: {name: 'alice'}, model: schema.User, user: db.admin});
                try {
                    await create(session, {content: {name: 'alice'}, model: schema.User, user: db.admin});
                } catch (err) {
                    expect(err).toBeInstanceOf(RecordExistsError);
                    return;
                }
                throw new Error('Did not throw expected error');
            });
        });
        describe('modify', () => {
            let original;
            beforeEach(async () => {
                original = await create(
                    session,
                    {content: {name: 'alice'}, model: schema.User, user: db.admin}
                );
            });
            test('update name error on duplicate', async () => {
                try {
                    await create(
                        session,
                        {content: {name: original.name}, model: schema.User, user: db.admin}
                    );
                } catch (err) {
                    expect(err).toBeInstanceOf(RecordExistsError);
                    return;
                }
                throw new Error('Did not throw expected error');
            });
            test('update ok', async () => {
                const query = parseRecord(
                    schema.User,
                    original,
                    {
                        history: true,
                        neighbors: 3
                    }
                );
                const updated = await update(session, {
                    changes: {name: 'bob'}, query, user: db.admin, model: schema.User
                });
                expect(updated).toHaveProperty('name', 'bob');
                expect(updated).toHaveProperty('history');
                expect(update.history).not.toBeNull;
            });
            test('delete', async () => {
                const query = parseRecord(
                    schema.User,
                    original,
                    {
                        history: true,
                        neighbors: 3
                    }
                );
                const deleted = await remove(
                    session,
                    {query, user: db.admin, model: schema.User}
                );
                expect(deleted).toHaveProperty('deletedAt');
                expect(deleted.deletedAt).not.toBeNull;
            });
        });
    });
    describe('usergroup', () => {
        test.todo('create new');
        test.todo('update existing');
        test.todo('delete');
    });
    describe('edges', () => {
        let srcVertex,
            tgtVertex,
            source;
        beforeEach(async () => {
            source = await create(
                session,
                {content: {name: 'source'}, model: schema.Source, user: db.admin}
            );
            ([srcVertex, tgtVertex] = await Promise.all([
                {sourceId: 'cancer'},
                {sourceId: 'carcinoma'}
            ].map(
                async content => create(
                    session,
                    {content: {...content, source}, model: schema.Disease, user: db.admin}
                )
            )));
        });
        describe('create new', () => {
            test('ok', async () => {
                const edge = await create(session, {
                    model: schema.AliasOf,
                    content: {
                        out: srcVertex,
                        in: tgtVertex,
                        source
                    },
                    user: db.admin
                });
                expect(edge).toHaveProperty('source');
                expect(edge.source).toEqual(source['@rid']);
                expect(edge.out).toEqual(srcVertex['@rid']);
                expect(edge.in).toEqual(tgtVertex['@rid']);
            });
            test('error on src = tgt', async () => {
                try {
                    await create(session, {
                        model: schema.AliasOf,
                        content: {
                            out: srcVertex,
                            in: srcVertex,
                            source
                        },
                        user: db.admin
                    });
                } catch (err) {
                    expect(err).toBeInstanceOf(AttributeError);
                    expect(err.message).toContain('an edge cannot be used to relate a node/vertex to itself');
                    return;
                }
                throw new Error('did not throw the expected error');
            });
            test('error on no src (out) vertex', async () => {
                try {
                    await create(session, {
                        model: schema.AliasOf,
                        content: {
                            out: null,
                            in: tgtVertex,
                            source
                        },
                        user: db.admin
                    });
                } catch (err) {
                    expect(err).toBeInstanceOf(AttributeError);
                    expect(err.message).toContain('[AliasOf] missing required attribute out');
                    return;
                }
                throw new Error('did not throw the expected error');
            });
            test('error on no tgt (in) vertex', async () => {
                try {
                    await create(session, {
                        model: schema.AliasOf,
                        content: {
                            out: srcVertex,
                            in: null,
                            source
                        },
                        user: db.admin
                    });
                } catch (err) {
                    expect(err).toBeInstanceOf(AttributeError);
                    expect(err.message).toContain('[AliasOf] missing required attribute in');
                    return;
                }
                throw new Error('did not throw the expected error');
            });
            test('allows null source', async () => {
                const record = await create(session, {
                    model: schema.AliasOf,
                    content: {
                        out: srcVertex,
                        in: tgtVertex,
                        source: null
                    },
                    user: db.admin
                });
                expect(record).toHaveProperty('source', null);
            });
        });
        describe('modify', () => {
            let original;
            beforeEach(async () => {
                original = await create(session, {
                    model: schema.AliasOf,
                    content: {
                        out: srcVertex,
                        in: tgtVertex,
                        comment: 'some original comment',
                        source
                    },
                    user: db.admin
                });
            });

            test('delete duplicates immediate vertices and creates history links', async () => {
                const query = parseRecord(
                    schema.AliasOf,
                    {'@rid': original['@rid'].toString(), createdAt: original.createdAt},
                );
                // now update the edge, both src and target node should have history after
                const result = await remove(session, {
                    query,
                    user: db.admin,
                    model: schema.AliasOf
                });
                expect(result).toHaveProperty('deletedBy');
                expect(result.createdBy).toEqual(db.admin['@rid']);
                expect(result).toHaveProperty('deletedAt');
                expect(result.deletedAt).not.toBeNull();
                const [newSrcVertex, newTgtVertex] = await session.record.get([srcVertex['@rid'], tgtVertex['@rid']]);
                expect(result.out).toEqual(newSrcVertex.history);
                expect(result.in).toEqual(newTgtVertex.history);
            });
            test('update is not allowed', async () => {
                const query = parseRecord(
                    schema.AliasOf,
                    {'@rid': original['@rid'].toString(), createdAt: original.createdAt},
                );
                // now update the edge, both src and target node should have history after
                try {
                    await update(session, {
                        query,
                        user: db.admin,
                        model: schema.AliasOf,
                        changes: {source: null}
                    });
                } catch (err) {
                    expect(err).toBeInstanceOf(NotImplementedError);
                    return;
                }
                throw new Error('Did not throw expected error');
            });
        });
    });
    describe('vertices', () => {
        describe('create new', () => {
            test('ok', async () => {
                const record = await create(session, {
                    model: schema.Source,
                    content: {
                        name: 'blargh'
                    },
                    user: db.admin
                });
                expect(record).toHaveProperty('name', 'blargh');
            });
            test('missing required property', async () => {
                try {
                    await create(session, {
                        model: schema.Source,
                        content: {},
                        user: db.admin
                    });
                } catch (err) {
                    expect(err.message).toContain('missing required attribute name');
                    return;
                }
                expect.fail('did not throw the expected error');
            });
        });
        describe('modify', () => {
            let cancer,
                carcinoma,
                source;

            beforeEach(async () => {
                source = await create(session, {
                    model: schema.Source,
                    content: {name: 'blargh'},
                    user: db.admin
                });
                ([cancer, carcinoma] = await Promise.all([
                    create(session, {
                        model: schema.Disease,
                        content: {sourceId: 'cancer', source},
                        user: db.admin
                    }),
                    create(session, {
                        model: schema.Disease,
                        content: {sourceId: 'carcinoma', source},
                        user: db.admin
                    })
                ]));
                // add a link
                await create(
                    session,
                    {content: {out: cancer, in: carcinoma}, model: schema.AliasOf, user: db.admin}
                );
            });
            test('update copies node and creates history link', async () => {
                const {name = null, sourceId, '@rid': rid} = cancer;
                const query = parseRecord(
                    schema.Disease,
                    {sourceId, source, name},
                    {
                        history: false,
                        neighbors: 3
                    }
                );

                // change the name
                const updated = await update(session, {
                    changes: {
                        name: 'new name'
                    },
                    model: schema.Disease,
                    user: db.admin,
                    query
                });
                // check that a history link has been added to the node
                expect(updated).toHaveProperty('name', 'new name');
                // check that the 'old'/copy node has the original details
                expect(updated['@rid']).toEqual(rid);
                // select the original node
                const reselectQuery = parseRecord(
                    schema.Disease,
                    {sourceId, source, name},
                    {
                        history: true,
                        neighbors: 3
                    }
                );

                const [reselected] = await select(
                    session,
                    reselectQuery,
                    {user: db.admin, exactlyN: 1}
                );
                expect(updated.history).toEqual(reselected['@rid']);
                expect(reselected.deletedBy['@rid']).toEqual(db.admin['@rid']);
                expect(updated.createdBy).toEqual(db.admin['@rid']);

                // check that the edges were not also copied
                expect(reselected).not.toHaveProperty('out_AliasOf');
            });
            test('delete also deletes linked edges', async () => {
                const original = cancer;
                const query = parseRecord(
                    schema.Disease,
                    {sourceId: original.sourceId, source},
                    {
                        history: true,
                        neighbors: 3
                    }
                );
                // change the name
                const deleted = await remove(session, {
                    model: schema.Disease,
                    user: db.admin,
                    query
                });

                // check that a history link has been added to the node
                expect(deleted).toHaveProperty('deletedAt');
                expect(deleted.deletedAt).not.toBeNull;
                // check that the 'old'/copy node has the original details
                expect(deleted['@rid']).toEqual(original['@rid']);
                expect(deleted).toHaveProperty('out_AliasOf');
                expect(Array.from(deleted.out_AliasOf)).toHaveProperty('length', 1);
            });
            test.todo('regular user can modify unprotected admin record');
            test.todo('regular user cannot modify admin protected record');
        });
    });
    describe('statements', () => {
        let disease,
            publication,
            relevance;
        beforeEach(async () => {
            const source = await create(
                session,
                {content: {name: 'some source'}, model: schema.Source, user: db.admin}
            );
            // set up the dependent records
            ([disease, publication, relevance] = await Promise.all([
                {content: {sourceId: 'disease:1234'}, model: schema.Disease},
                {content: {sourceId: 'publication:1234'}, model: schema.Publication},
                {content: {sourceId: 'relevance:1234'}, model: schema.Vocabulary}
            ].map(async opt => create(
                session,
                {...opt, content: {...opt.content, source}, user: db.admin}
            ))));
        });
        test('enforces psuedo-unique contraint by select', async () => {
            // create the statement
            await create(
                session,
                {
                    content: {
                        impliedBy: [disease],
                        appliesTo: disease,
                        relevance,
                        supportedBy: [publication]
                    },
                    model: schema.Statement,
                    user: db.admin
                }
            );
            // throws RecordExistsError on next create call
            try {
                await create(
                    session,
                    {
                        content: {
                            impliedBy: [disease],
                            appliesTo: disease,
                            relevance,
                            supportedBy: [publication]
                        },
                        model: schema.Statement,
                        user: db.admin
                    }
                );
            } catch (err) {
                expect(err).toBeInstanceOf(RecordExistsError);
                return;
            }
            throw new Error('Did not throw the expected error');
        });
    });
});
