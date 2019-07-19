/**
 * Tests for building read only queries at the db level
 */
const {schema: {schema}} = require('@bcgsc/knowledgebase-schema');

const {
    select,
    selectCounts,
    fetchDisplayName,
    getUserByName,
    selectByKeyword,
    searchSelect,
    selectFromList
} = require('../../app/repo/commands');
const {
    AttributeError, NoRecordFoundError
} = require('../../app/repo/error');
const {
    Query
} = require('../../app/repo/query');


const {createSeededDb, tearDownDb} = require('./util');


const TEST_TIMEOUT_MS = 100000;
jest.setTimeout(TEST_TIMEOUT_MS);

const describeWithAuth = process.env.GKB_DBS_PASS
    ? describe
    : describe.skip;

if (!process.env.GKB_DBS_PASS) {
    console.warn('Cannot run tests without database password (GKB_DBS_PASS)');
}

describeWithAuth('select queries', () => {
    let db;
    beforeAll(async () => {
        db = await createSeededDb();
    });
    afterAll(async () => {
        await tearDownDb(db);
    });
    describe('paginate basic query', () => {
        let original;
        beforeAll(async () => {
            const query = Query.parse(schema, schema.Disease, {});
            original = await select(db.session, query, {user: db.admin});
        });
        test('limit', async () => {
            const query = Query.parse(schema, schema.Disease, {
                limit: 1
            });
            const records = await select(db.session, query, {user: db.admin});
            expect(records).toHaveProperty('length', 1);
            expect(records[0]).toEqual(original[0]);
        });
        test('skip', async () => {
            const query = Query.parse(schema, schema.Disease, {
                skip: 2
            });
            const records = await select(db.session, query, {user: db.admin});
            expect(records).toHaveProperty('length', 1);
            expect(records[0]).toEqual(original[2]);
        });
        test('skip and limit', async () => {
            const query = Query.parse(schema, schema.Disease, {
                skip: 1,
                limit: 1
            });
            const records = await select(db.session, query, {user: db.admin});
            expect(records).toHaveProperty('length', 1);
            expect(records[0]).toEqual(original[1]);
        });
    });
    describe('selectCounts', () => {
        test('defaults to all classes', async () => {
            const counts = await selectCounts(db.session);
            expect(counts).toHaveProperty('Disease', 3);
            expect(counts).toHaveProperty('User', 1);
        });
        test('with source subgrouping', async () => {
            const source = db.records.source['@rid'];
            const counts = await selectCounts(db.session, {classList: ['Disease', 'Source'], groupBySource: true});
            expect(counts).toEqual({Disease: {[source]: 3}, Source: {null: 1}});
        });
    });
    describe('getUserByName', () => {
        test('ok', async () => {
            const user = await getUserByName(db.session, db.admin.name);
            expect(user).toHaveProperty('name', db.admin.name);
        });
        test('error on not found', async () => {
            try {
                await getUserByName(db.session, 'blargh monkeys');
            } catch (err) {
                expect(err).toBeInstanceOf(NoRecordFoundError);
                return;
            }
            throw new Error('Did not throw the expected error');
        });
    });
    describe('selectByKeyword', () => {
        test('get from related variant reference', async () => {
            const result = await selectByKeyword(db.session, ['kras']);
            expect(result).toHaveProperty('length', 2);
        });
        test('multiple keywords are co-required', async () => {
            expect(
                await selectByKeyword(db.session, ['kras', 'resistance'])
            ).toHaveProperty('length', 0);
            expect(
                await selectByKeyword(db.session, ['kras', 'sensitivity'])
            ).toHaveProperty('length', 0);
        });
    });
    describe('searchSelect', () => {
        test('get gene from related gene', async () => {
            const result = await searchSelect(
                db.session,
                {model: schema.Feature, search: {sourceId: ['kras']}}
            );
            // fetches the related gene kras1
            expect(result).toHaveProperty('length', 2);
        });
        test('OR values given for the same property', async () => {
            const singleValueResult = await searchSelect(
                db.session,
                {model: schema.Vocabulary, search: {sourceId: ['sensitivity']}}
            );
            expect(singleValueResult).toHaveProperty('length', 1);
            const result = await searchSelect(
                db.session,
                {model: schema.Vocabulary, search: {sourceId: ['sensitivity', 'resistance']}}
            );
            expect(result).toHaveProperty('length', 2);
        });
        test('custom projection', async () => {
            const result = await searchSelect(
                db.session,
                {model: schema.Feature, search: {sourceId: ['kras']}, projection: 'sourceId'}
            );
            // fetches the related gene kras1
            expect(result).toHaveProperty('length', 2);
            expect(result[0]).toHaveProperty('sourceId');
            expect(Object.keys(result[0])).toHaveProperty('length', 1);
        });
        test('default to all', async () => {
            const result = await searchSelect(
                db.session,
                {model: schema.Disease, search: {}}
            );
            expect(result).toHaveProperty('length', 3);
        });
        test('get variant by related gene', async () => {
            const {kras} = db.records;
            const result = await searchSelect(
                db.session,
                {model: schema.Variant, search: {reference1: [kras]}}
            );
            // fetches the related gene kras1 and then the variants on it
            expect(result).toHaveProperty('length', 2);
        });
        test('select by linkset', async () => {
            const {krasMut} = db.records;
            const result = await searchSelect(
                db.session,
                {model: schema.Statement, search: {impliedBy: [krasMut]}}
            );
            // krasMut is inferred by krasSub
            expect(result).toHaveProperty('length', 2);
        });
        test('select by outgoing edge', async () => {
            const {cancer} = db.records;
            const result = await searchSelect(
                db.session,
                {model: schema.Disease, search: {out_SubClassOf: [cancer]}}
            );
            // krasMut is inferred by krasSub
            expect(result).toHaveProperty('length', 3);
        });
        test('select by incoming edge', async () => {
            const {cancer} = db.records;
            const result = await searchSelect(
                db.session,
                {model: schema.Disease, search: {in_SubClassOf: [cancer]}}
            );
            // krasMut is inferred by krasSub
            expect(result).toHaveProperty('length', 3);
        });
        test('select for embedded iterable', async () => {
            const result = await searchSelect(
                db.session,
                {model: schema.Disease, search: {subsets: ['wordy', 'singlesubseT']}}
            );
            expect(result).toHaveProperty('length', 3);
            const noResult = await searchSelect(
                db.session,
                {model: schema.Disease, search: {subsets: ['blargh monkeys']}}
            );
            expect(noResult).toHaveProperty('length', 0);
        });
    });
    describe('selectFromList', () => {
        test('throws error on bad record ID', async () => {
            const {krasMut, krasSub} = db.records;
            try {
                await selectFromList(db.session, [krasMut, krasSub, '44444:982958']);
            } catch (err) {
                expect(err).toBeInstanceOf(AttributeError);
                return;
            }
            throw new Error('Did not throw expected error');
        });
        test('returns in the original order', async () => {
            const {krasMut, krasSub} = db.records;
            const result = await selectFromList(db.session, [krasMut, krasSub]);
            expect(result).toHaveProperty('length', 2);
            expect(result[0]['@rid']).toEqual(krasMut['@rid']);
            expect(result[1]['@rid']).toEqual(krasSub['@rid']);
            // now reverse and try again
            const reverseResult = await selectFromList(db.session, [krasSub, krasMut]);
            expect(reverseResult).toHaveProperty('length', 2);
            expect(reverseResult[1]['@rid']).toEqual(krasMut['@rid']);
            expect(reverseResult[0]['@rid']).toEqual(krasSub['@rid']);
        });
    });
    describe('fetchDisplayName', () => {
        test('PositionalVariant', async () => {
            const name = await fetchDisplayName(
                db.session, schema.PositionalVariant, db.records.krasSub
            );
            expect(name).toEqual('KRAS1:p.G12D');
        });
        test('CategoryVariant', async () => {
            const name = await fetchDisplayName(
                db.session, schema.CategoryVariant, db.records.krasMut
            );
            expect(name).toEqual('KRAS mutation');
        });
        test('Statement', async () => {
            const name = await fetchDisplayName(
                db.session, schema.Statement, db.records.resToDrug
            );
            expect(name).toBeNull;
        });
    });
    describe('select with query builder', () => {
        test.todo('select on related edge properties');
        test.todo('select on related uni-directional edge properties');
    });
});
