/**
 * Tests for building read only queries at the db level
 */
const { schema: { schema } } = require('@bcgsc/knowledgebase-schema');

const {
    select,
    selectCounts,
    fetchDisplayName,
    getUserByName,
} = require('../../src/repo/commands');
const {
    AttributeError, NoRecordFoundError,
} = require('../../src/repo/error');
const {
    parse,
} = require('../../src/repo/query_builder');


const { createSeededDb, tearDownDb } = require('./util');


const TEST_TIMEOUT_MS = 100000;
jest.setTimeout(TEST_TIMEOUT_MS);

const describeWithAuth = process.env.GKB_DBS_PASS
    ? describe
    : describe.skip;

if (!process.env.GKB_DBS_PASS) {
    console.warn('Cannot run tests without database password (GKB_DBS_PASS)');
}

describeWithAuth('query builder', () => {
    let db,
        session;

    beforeAll(async () => {
        db = await createSeededDb();
        session = await db.pool.acquire();
    });

    afterAll(async () => {
        await session.close();
        await tearDownDb(db);
        await db.pool.close();
        await db.server.close();
    });

    describe('paginate basic query', () => {
        let original;

        beforeAll(async () => {
            const query = parse({ target: 'Disease' });
            original = await select(session, query, { user: db.admin });
        });

        test('limit', async () => {
            const query = parse({
                limit: 1, target: 'Disease',
            });
            const records = await select(session, query, { user: db.admin });
            expect(records).toHaveProperty('length', 1);
            expect(records[0]).toEqual(original[0]);
        });

        test('skip', async () => {
            const query = parse({
                skip: 2, target: 'Disease',
            });
            const records = await select(session, query, { user: db.admin });
            expect(records).toHaveProperty('length', 1);
            expect(records[0]).toEqual(original[2]);
        });

        test('skip and limit', async () => {
            const query = parse({
                skip: 1,
                limit: 1,
                target: 'Disease',
            });
            const records = await select(session, query, { user: db.admin });
            expect(records).toHaveProperty('length', 1);
            expect(records[0]).toEqual(original[1]);
        });
    });

    describe('selectCounts', () => {
        test('defaults to all classes', async () => {
            const counts = await selectCounts(session);
            expect(counts).toHaveProperty('Disease', 3);
            expect(counts).toHaveProperty('User', 1);
        });

        test('with source subgrouping', async () => {
            const source = db.records.source['@rid'];
            const counts = await selectCounts(session, { classList: ['Disease', 'Source'], groupBySource: true });
            expect(counts).toEqual({ Disease: { [source]: 3 }, Source: { null: 1 } });
        });
    });

    describe('getUserByName', () => {
        test('ok', async () => {
            const user = await getUserByName(session, db.admin.name);
            expect(user).toHaveProperty('name', db.admin.name);
        });

        test('error on not found', async () => {
            try {
                await getUserByName(session, 'blargh monkeys');
            } catch (err) {
                expect(err).toBeInstanceOf(NoRecordFoundError);
                return;
            }
            throw new Error('Did not throw the expected error');
        });
    });

    describe('selectByKeyword', () => {
        test('get from related variant reference', async () => {
            const query = parse({ target: 'Statement', queryType: 'keyword', keyword: 'kras' });
            const result = await select(session, query);
            expect(result).toHaveProperty('length', 2);
        });

        test('multiple keywords are co-required', async () => {
            expect(
                await select(
                    session,
                    parse({ target: 'Statement', queryType: 'keyword', keyword: 'kras resistance' }),
                ),
            ).toHaveProperty('length', 0);
            expect(
                await select(
                    session,
                    parse({ target: 'Statement', queryType: 'keyword', keyword: 'kras sensitivity' }),
                ),
            ).toHaveProperty('length', 0);
        });
    });

    test('custom projection', async () => {
        const { kras } = db.records;
        const result = await select(
            session,
            parse({ target: [kras], returnProperties: ['sourceId'] }),
        );
        // fetches the related gene kras1
        expect(result).toEqual([{ sourceId: 'kras' }]);
    });

    test('select for embedded iterable', async () => {
        let result = await select(
            session,
            parse({ target: 'Disease', filters: { subsets: ['wordy', 'singlesubseT'] } }),
        );
        expect(result).toHaveProperty('length', 1);
        result = await select(
            session,
            parse({ target: 'Disease', filters: { subsets: ['wordy', 'singlesubseT'], operator: 'CONTAINSANY' } }),
        );
        expect(result).toHaveProperty('length', 2);
        const noResult = await select(
            session,
            parse({ target: 'Disease', filters: { subsets: ['blargh monkeys'] } }),
        );
        expect(noResult).toHaveProperty('length', 0);
    });

    describe('similarTo', () => {
        test('get gene from related gene', async () => {
            const result = await select(
                session,
                parse({
                    queryType: 'similarTo',
                    target: { target: 'Feature', filters: { sourceId: 'kras' } },
                }),
            );
            // fetches the related gene kras1
            expect(result).toHaveProperty('length', 2);
        });

        test('get variant by related gene', async () => {
            const result = await select(
                session,
                parse({
                    target: 'Variant',
                    filters: {
                        reference1: {
                            queryType: 'similarTo',
                            target: { target: 'Feature', filters: { sourceId: 'kras' } },
                        },
                    },
                }),
            );
            // fetches the related gene kras1 and then the variants on it
            expect(result).toHaveProperty('length', 2);
        });

        test('select statements by loose variant match', async () => {
            const { krasSub } = db.records;
            const result = await select(
                session,
                parse({
                    target: 'Statement',
                    filters: {
                        conditions: {
                            queryType: 'similarTo',
                            target: [krasSub],
                        },
                    },
                }),
            );
            // krasMut is inferred by krasSub
            expect(result).toHaveProperty('length', 2);
        });
    });

    describe('selectFromList', () => {
        test('throws error on bad record ID', async () => {
            const { krasMut, krasSub } = db.records;

            try {
                await select(session, parse({ target: [krasMut, krasSub, '44444:982958'] }));
            } catch (err) {
                expect(err).toBeInstanceOf(AttributeError);
                return;
            }
            throw new Error('Did not throw expected error');
        });

        test('returns in the original order', async () => {
            const { krasMut, krasSub } = db.records;
            const result = await select(session, parse({ target: [krasMut, krasSub] }));
            expect(result).toHaveProperty('length', 2);
            expect(result[0]['@rid']).toEqual(krasMut['@rid']);
            expect(result[1]['@rid']).toEqual(krasSub['@rid']);
            // now reverse and try again
            const reverseResult = await select(session, parse({ target: [krasSub, krasMut] }));
            expect(reverseResult).toHaveProperty('length', 2);
            expect(reverseResult[1]['@rid']).toEqual(krasMut['@rid']);
            expect(reverseResult[0]['@rid']).toEqual(krasSub['@rid']);
        });
    });

    describe('fetchDisplayName', () => {
        test('PositionalVariant', async () => {
            const name = await fetchDisplayName(
                session, schema.PositionalVariant, db.records.krasSub,
            );
            expect(name).toEqual('KRAS1:p.G12D');
        });

        test('CategoryVariant', async () => {
            const name = await fetchDisplayName(
                session, schema.CategoryVariant, db.records.krasMut,
            );
            expect(name).toEqual('KRAS mutation');
        });

        test('Statement', async () => {
            const name = await fetchDisplayName(
                session, schema.Statement, db.records.resToDrug,
            );
            expect(name).toBeNull();
        });
    });

    describe('select with query builder', () => {
        test.todo('select on related edge properties');

        test.todo('select on related uni-directional edge properties');
    });
});
