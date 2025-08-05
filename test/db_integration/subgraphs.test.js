/**
 * Tests for building traversal queries at the db level (read only)
 */
const {
    composition,
    immediate,
    similarity,
    transitive,
    traverse,
} = require('../../src/repo/subgraphs/traversal');
const { baseValidation, queryWithPagination } = require('../../src/repo/subgraphs/util');
const { ValidationError } = require('../../src/repo/error');
const { createSeededDbForSubgraphs, tearDownDb } = require('./util');

const TEST_TIMEOUT_MS = 100000;
jest.setTimeout(TEST_TIMEOUT_MS);

const describeWithAuth = process.env.GKB_DBS_PASS
    ? describe
    : describe.skip;

if (!process.env.GKB_DBS_PASS) {
    console.warn('Cannot run tests without database password (GKB_DBS_PASS)');
}

describeWithAuth('subgraphs traversal', () => {
    let base,
        db,
        session;

    beforeAll(async () => {
        db = await createSeededDbForSubgraphs();
        session = await db.pool.acquire();
        base = [String(db.records.v[8]['@rid'])]; // default base records common for all tests
    });

    afterAll(async () => {
        await session.close();
        await tearDownDb(db); //
        await db.pool.close();
        await db.server.close();
    });

    describe('similarity', () => {
        test('similarity traversal with defaults', async () => {
            const result = await similarity(
                session,
                'Disease',
                base,
            );
            expect(result.size).toBe(7);
        });
    });

    describe('immediate', () => {
        test('ascending immediate traversal with defaults', async () => {
            const result = await immediate(
                session,
                'Disease',
                base,
                'ascending',
            );
            expect(result.size).toBe(17);
        });

        test('descending immediate traversal with defaults', async () => {
            const result = await immediate(
                session,
                'Disease',
                base,
                'descending',
            );
            expect(result.size).toBe(13);
        });
    });

    describe('transitive', () => {
        test('ascending transitive traversal with defaults', async () => {
            const result = await transitive(
                session,
                'Disease',
                base,
                'ascending',
            );
            expect(result.size).toBe(18);
        });

        test('descending transitive traversal with defaults', async () => {
            const result = await transitive(
                session,
                'Disease',
                base,
                'descending',
            );
            expect(result.size).toBe(17);
        });
    });

    describe('composition', () => {
        test('composition traversal with defaults', async () => {
            const result = await composition(
                session,
                'Disease',
            );
            expect(result.size).toBe(
                db.records.v.length + db.records.e.length,
            );
        });
    });

    describe('traverse', () => {
        test('tree traversal, with acs. + desc. transitive traversal', async () => {
            const result = await traverse(
                session,
                'Disease',
                {
                    base,
                    direction: 'split',
                },
            );
            expect(Object.keys(result.g.edges).length).toBe(14);
            expect(Object.keys(result.g.nodes).length).toBe(14);
        });

        test('parents traversal, with acs. immediate traversal', async () => {
            const result = await traverse(
                session,
                'Disease',
                {
                    base,
                    direction: 'ascending',
                    firstGenerationOnly: true,
                },
            );
            expect(Object.keys(result.g.edges).length).toBe(8);
            expect(Object.keys(result.g.nodes).length).toBe(9);
        });

        test('ancestors traversal, with acs. transitive traversal', async () => {
            const result = await traverse(
                session,
                'Disease',
                {
                    base,
                    direction: 'ascending',
                    firstGenerationOnly: false,
                },
            );
            expect(Object.keys(result.g.edges).length).toBe(9);
            expect(Object.keys(result.g.nodes).length).toBe(9);
        });

        test('children traversal, with desc. immediate traversal', async () => {
            const result = await traverse(
                session,
                'Disease',
                {
                    base,
                    direction: 'descending',
                    firstGenerationOnly: true,
                },
            );
            expect(Object.keys(result.g.edges).length).toBe(6);
            expect(Object.keys(result.g.nodes).length).toBe(7);
        });

        test('descendants traversal, with desc. transitive traversal', async () => {
            const result = await traverse(
                session,
                'Disease',
                {
                    base,
                    direction: 'descending',
                    firstGenerationOnly: false,
                },
            );
            expect(Object.keys(result.g.edges).length).toBe(8);
            expect(Object.keys(result.g.nodes).length).toBe(9);
        });
    });

    describe('complete traversal with composition', () => {
        let result;

        beforeAll(async () => {
            result = await traverse(
                session,
                'Disease',
                {
                    direction: 'both',
                    subgraph: 'both',
                },
            );
        });

        test('nodes & edges', async () => {
            expect(Object.keys(result.g.edges).length).toBe(db.records.e.length);
            expect(Object.keys(result.g.nodes).length).toBe(db.records.v.length);
        });

        test('adjacency list', async () => {
            expect(Object.keys(result.g.adjacency).length).toBe(26);
        });

        test('components', async () => {
            expect(Object.keys(result.g.components).length).toBe(3);
        });

        test('virtualizarion', async () => {
            expect(Object.keys(result.v.edges).length).toBe(14);
            expect(Object.keys(result.v.nodes).length).toBe(14);
            expect(Object.keys(result.v.g_to_v).length).toBe(26);
            expect(Object.keys(result.v.v_to_g).length).toBe(14);
            expect(Object.keys(result.v.adjacency).length).toBe(14);
            expect(Object.keys(result.v.components).length).toBe(3);
        });
    });

    describe('baseValidation', () => {
        test('throwing ValidationError on malformed base (invalid RID)', async () => {
            await expect(
                baseValidation(session, 'Disease', ['xyz']),
            ).rejects.toThrow(ValidationError);
        });

        test('throwing ValidationError on malformed base (Valid RID, wrong ontology)', async () => {
            await expect(
                baseValidation(session, 'Source', base),
            ).rejects.toThrow(ValidationError);
        });

        test('not throwing error on valid base', async () => {
            await expect(
                baseValidation(session, 'Disease', base),
            ).resolves.not.toThrow(ValidationError);
        });
    });

    describe('queryWithPagination', () => {
        test('no results', async () => {
            const queryString = 'SELECT FROM :ontology WHERE name = :name';
            const params = { params: { name: 'xyz', ontology: 'Disease' } };
            const result = await queryWithPagination(session, queryString, params);
            expect(result.length).toBe(0);
        });

        test('limit lower than page size; no pagination needed', async () => {
            const queryString = 'SELECT FROM :ontology';
            const params = { params: { ontology: 'Disease' } };
            const opt = { maxSize: 1, pageSize: 2 };
            const result = await queryWithPagination(session, queryString, params, opt);
            expect(result.length).toBe(1);
        });

        test('page size lower than limit; pagination', async () => {
            const queryString = 'SELECT FROM :ontology';
            const params = { params: { ontology: 'Disease' } };
            const opt = { maxSize: 2, pageSize: 1 };
            const result = await queryWithPagination(session, queryString, params, opt);
            expect(result.length).toBe(2);
        });
    });
});
