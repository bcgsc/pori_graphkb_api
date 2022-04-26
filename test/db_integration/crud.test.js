const { util } = require('@bcgsc-pori/graphkb-schema');

const {
    create,
    update,
    remove,
    select,
} = require('../../src/repo/commands');
const {
    RecordConflictError, ValidationError, NotImplementedError,
} = require('../../src/repo/error');
const {
    parseRecord,
} = require('../../src/repo/query_builder');

const { clearDB, createEmptyDb, tearDownDb } = require('./util');

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
        await clearDB({ admin: db.admin, session });
    });

    test('update error on missing changes argument', async () => {
        try {
            await update(session, { modelName: 'User', query: {}, user: db.admin });
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
                const record = await create(session, { content: { name: 'alice' }, modelName: 'User', user: db.admin });
                expect(record).toHaveProperty('name', 'alice');
            });

            test('error on duplicate name', async () => {
                await create(session, { content: { name: 'alice' }, modelName: 'User', user: db.admin });

                try {
                    await create(session, { content: { name: 'alice' }, modelName: 'User', user: db.admin });
                } catch (err) {
                    expect(err).toBeInstanceOf(RecordConflictError);
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
                    { content: { name: 'alice' }, modelName: 'User', user: db.admin },
                );
            });

            test('update name error on duplicate', async () => {
                try {
                    await create(
                        session,
                        { content: { name: original.name }, modelName: 'User', user: db.admin },
                    );
                } catch (err) {
                    expect(err).toBeInstanceOf(RecordConflictError);
                    return;
                }
                throw new Error('Did not throw expected error');
            });

            test('update ok', async () => {
                const query = parseRecord(
                    'User',
                    original,
                    {
                        history: true,
                        neighbors: 3,
                    },
                );
                const updated = await update(session, {
                    changes: { name: 'bob' }, modelName: 'User', query, user: db.admin,
                });
                expect(updated).toHaveProperty('name', 'bob');
                expect(updated).toHaveProperty('history');
                expect(updated.history).not.toBeNull();
            });

            test('non-paranoid update does not duplicate record', async () => {
                const query = parseRecord(
                    'User',
                    original,
                    {
                        history: true,
                        neighbors: 3,
                    },
                );
                const updated = await update(session, {
                    changes: { name: 'bob2' },
                    modelName: 'User',
                    paranoid: false,
                    query,
                    user: db.admin,
                });
                expect(updated).toEqual(1);
            });

            test('delete', async () => {
                const query = parseRecord(
                    'User',
                    original,
                    {
                        history: true,
                        neighbors: 3,
                    },
                );
                const deleted = await remove(
                    session,
                    { modelName: 'User', query, user: db.admin },
                );
                expect(deleted).toHaveProperty('deletedAt');
                expect(deleted.deletedAt).not.toBeNull();
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
                { content: { name: 'source' }, modelName: 'Source', user: db.admin },
            );
            ([srcVertex, tgtVertex] = await Promise.all([
                { sourceId: 'cancer' },
                { sourceId: 'carcinoma' },
            ].map(
                async (content) => create(
                    session,
                    { content: { ...content, source }, modelName: 'Disease', user: db.admin },
                ),
            )));
        });

        describe('create new', () => {
            test('ok', async () => {
                const edge = await create(session, {
                    content: {
                        in: tgtVertex,
                        out: srcVertex,
                        source,
                    },
                    modelName: 'AliasOf',
                    user: db.admin,
                });
                expect(edge).toHaveProperty('source');
                expect(edge.source).toEqual(source['@rid']);
                expect(edge.out).toEqual(srcVertex['@rid']);
                expect(edge.in).toEqual(tgtVertex['@rid']);
            });

            test('error on src = tgt', async () => {
                try {
                    await create(session, {
                        content: {
                            in: srcVertex,
                            out: srcVertex,
                            source,
                        },
                        modelName: 'AliasOf',
                        user: db.admin,
                    });
                } catch (err) {
                    expect(err).toBeInstanceOf(ValidationError);
                    expect(err.message).toContain('an edge cannot be used to relate a node/vertex to itself');
                    return;
                }
                throw new Error('did not throw the expected error');
            });

            test('error on no src (out) vertex', async () => {
                try {
                    await create(session, {
                        content: {
                            in: tgtVertex,
                            out: null,
                            source,
                        },
                        modelName: 'AliasOf',
                        user: db.admin,
                    });
                } catch (err) {
                    expect(err).toBeInstanceOf(ValidationError);
                    expect(err.message).toContain('[AliasOf] missing required attribute out');
                    return;
                }
                throw new Error('did not throw the expected error');
            });

            test('error on no tgt (in) vertex', async () => {
                try {
                    await create(session, {
                        content: {
                            in: null,
                            out: srcVertex,
                            source,
                        },
                        modelName: 'AliasOf',
                        user: db.admin,
                    });
                } catch (err) {
                    expect(err).toBeInstanceOf(ValidationError);
                    expect(err.message).toContain('[AliasOf] missing required attribute in');
                    return;
                }
                throw new Error('did not throw the expected error');
            });

            test('allows null source', async () => {
                const record = await create(session, {
                    content: {
                        in: tgtVertex,
                        out: srcVertex,
                        source: null,
                    },
                    modelName: 'AliasOf',
                    user: db.admin,
                });
                expect(record).toHaveProperty('source', null);
            });
        });

        describe('modify', () => {
            let original;

            beforeEach(async () => {
                original = await create(session, {
                    content: {
                        comment: 'some original comment',
                        in: tgtVertex,
                        out: srcVertex,
                        source,
                    },
                    modelName: 'AliasOf',
                    user: db.admin,
                });
            });

            test('delete duplicates immediate vertices and creates history links', async () => {
                const query = parseRecord(
                    'AliasOf',
                    { '@rid': original['@rid'].toString(), createdAt: original.createdAt },
                );
                // now update the edge, both src and target node should have history after
                const result = await remove(session, {
                    modelName: 'AliasOf',
                    query,
                    user: db.admin,
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
                    'AliasOf',
                    { '@rid': original['@rid'].toString(), createdAt: original.createdAt },
                );

                // now update the edge, both src and target node should have history after
                try {
                    await update(session, {
                        changes: { source: null },
                        modelName: 'AliasOf',
                        query,
                        user: db.admin,
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
                    content: {
                        name: 'blargh',
                    },
                    modelName: 'Source',
                    user: db.admin,
                });
                expect(record).toHaveProperty('name', 'blargh');
            });

            test('missing required property', async () => {
                try {
                    await create(session, {
                        content: {},
                        modelName: 'Source',
                        user: db.admin,
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
                    content: { name: 'blargh' },
                    modelName: 'Source',
                    user: db.admin,
                });
                ([cancer, carcinoma] = await Promise.all([
                    create(session, {
                        content: { source, sourceId: 'cancer' },
                        modelName: 'Disease',
                        user: db.admin,
                    }),
                    create(session, {
                        content: { source, sourceId: 'carcinoma' },
                        modelName: 'Disease',
                        user: db.admin,
                    }),
                ]));
                // add a link
                await create(
                    session,
                    { content: { in: carcinoma, out: cancer }, modelName: 'AliasOf', user: db.admin },
                );
            });

            test('update copies node and creates history link', async () => {
                const { name = null, sourceId, '@rid': rid } = cancer;
                const query = parseRecord(
                    'Disease',
                    { name, source, sourceId },
                    {
                        history: false,
                        neighbors: 3,
                    },
                );

                // change the name
                const updated = await update(session, {
                    changes: {
                        name: 'new name',
                    },
                    modelName: 'Disease',
                    query,
                    user: db.admin,
                });
                // check that a history link has been added to the node
                expect(updated).toHaveProperty('name', 'new name');
                // check that the 'old'/copy node has the original details
                expect(updated['@rid']).toEqual(rid);
                // select the original node
                const reselectQuery = parseRecord(
                    'Disease',
                    { name, source, sourceId },
                    {
                        history: true,
                        neighbors: 3,
                    },
                );

                const [reselected] = await select(
                    session,
                    reselectQuery,
                    { exactlyN: 1, user: db.admin },
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
                    'Disease',
                    { source, sourceId: original.sourceId },
                    {
                        history: true,
                        neighbors: 3,
                    },
                );
                // change the name
                const deleted = await remove(session, {
                    modelName: 'Disease',
                    query,
                    user: db.admin,
                });

                // check that a history link has been added to the node
                expect(deleted).toHaveProperty('deletedAt');
                expect(deleted.deletedAt).not.toBeNull();
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
            relevance,
            trial,
            therapy,
            variant;

        beforeEach(async () => {
            const source = await create(
                session,
                { content: { name: 'some source' }, modelName: 'Source', user: db.admin },
            );
            // set up the dependent records
            let feature;
            const parts = await Promise.all([
                { content: { sourceId: 'disease:1234' }, modelName: 'Disease' },
                { content: { sourceId: 'publication:1234' }, modelName: 'Publication' },
                { content: { sourceId: 'trial:1234' }, modelName: 'ClinicalTrial' },
                { content: { name: 'sensitivity', sourceId: 'sensitivity' }, modelName: 'Vocabulary' },
                { content: { sourceId: 'therapy:1234' }, modelName: 'Therapy' },
                { content: { biotype: 'gene', sourceId: 'feature:1234' }, modelName: 'Feature' },
            ].map(async (opt) => create(
                session,
                { ...opt, content: { ...opt.content, source }, user: db.admin },
            )));
            [disease, trial, publication, relevance, therapy, feature] = parts
                .map(util.castToRID)
                .map((x) => x.toString());

            variant = await create(session, {
                content: { reference1: feature, type: relevance },
                modelName: 'CategoryVariant',
                user: db.admin,
            });
        });

        test('enforces psuedo-unique contraint by select', async () => {
            // create the statement
            await create(
                session,
                {
                    content: {
                        conditions: [disease],
                        evidence: [publication],
                        relevance,
                        subject: disease,
                    },
                    modelName: 'Statement',
                    user: db.admin,
                },
            );

            // throws RecordConflictError on next create call
            try {
                await create(
                    session,
                    {
                        content: {
                            conditions: [disease],
                            evidence: [publication],
                            relevance,
                            subject: disease,
                        },
                        modelName: 'Statement',
                        user: db.admin,
                    },
                );
            } catch (err) {
                expect(err).toBeInstanceOf(RecordConflictError);
                return;
            }
            throw new Error('Did not throw the expected error');
        });

        test('creates non-default displayNameTemplate', async () => {
            // create the statement
            const result = await create(
                session,
                {
                    content: {
                        conditions: [disease, variant, therapy],
                        evidence: [publication],
                        relevance,
                        subject: therapy,
                    },
                    modelName: 'Statement',
                    user: db.admin,
                },
            );
            expect(result.displayNameTemplate).toEqual('{conditions:variant} is associated with {relevance} to {subject} in {conditions:disease} ({evidence})');
        });

        describe('UPDATE', () => {
            let originalStatement,
                query;

            beforeEach(async () => {
                originalStatement = await create(
                    session,
                    {
                        content: {
                            conditions: [disease, variant, therapy],
                            evidence: [publication],
                            relevance,
                            subject: therapy,
                        },
                        modelName: 'Statement',
                        user: db.admin,
                    },
                );
                query = parseRecord(
                    'Statement',
                    originalStatement,
                    {
                        history: true,
                        neighbors: 3,
                    },
                );
            });

            test('updates the displayNameTemplate when excluded from changes', async () => {
                const result = await update(
                    session,
                    {
                        changes: {
                            conditions: [variant, therapy],
                        },
                        modelName: 'Statement',
                        query,
                        user: db.admin,
                    },
                );
                expect(result.displayNameTemplate).toEqual('{conditions:variant} is associated with {relevance} to {subject} ({evidence})');
            });

            test('uses the displayNameTemplate when included in changes', async () => {
                const result = await update(
                    session,
                    {
                        changes: {
                            conditions: [variant, therapy],
                            displayNameTemplate: originalStatement.displayNameTemplate,
                        },
                        modelName: 'Statement',
                        query,
                        user: db.admin,
                    },
                );
                expect(result.displayNameTemplate).toEqual(originalStatement.displayNameTemplate);
            });

            test('adds the subject to conditions when updated and conditions not given', async () => {
                const result = await update(
                    session,
                    {
                        changes: {
                            subject: trial,
                        },
                        modelName: 'Statement',
                        query,
                        user: db.admin,
                    },
                );
                expect(result).toHaveProperty('subject');
                expect(result.subject.toString()).toEqual(trial);
                expect(result).toHaveProperty('conditions');
                expect(result.conditions.map((x) => x.toString())).toContain(trial);
            });

            test('adds the subject to conditions when updated and conditions given without', async () => {
                const result = await update(
                    session,
                    {
                        changes: {
                            conditions: [disease],
                            subject: trial,
                        },
                        modelName: 'Statement',
                        query,
                        user: db.admin,
                    },
                );
                expect(result).toHaveProperty('subject');
                expect(result.subject.toString()).toEqual(trial);
                expect(result).toHaveProperty('conditions');
                expect(result.conditions.map((x) => x.toString())).toContain(trial);
                expect(result.conditions.map((x) => x.toString())).toContain(disease);
            });

            test('does not allow excluding the subject from conditions', async () => {
                // create the statement
                const result = await update(
                    session,
                    {
                        changes: {
                            conditions: [variant],
                        },
                        modelName: 'Statement',
                        query,
                        user: db.admin,
                    },
                );
                expect(result).toHaveProperty('subject');
                expect(result.subject.toString()).toEqual(therapy);
                expect(result).toHaveProperty('conditions');
                expect(result.conditions.map((x) => x.toString())).toContain(therapy);
                expect(result.conditions.map((x) => x.toString())).toContain(util.castToRID(variant).toString());
            });
        });
    });
});
