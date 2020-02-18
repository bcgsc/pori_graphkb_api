/**
 * Tests for building read only queries including their routing
 */
const requestPromise = require('request-promise');
const HTTP_STATUS = require('http-status-codes');

const { AppServer } = require('../../src');
const { generateToken } = require('../../src/routes/auth');

const { createSeededDb, tearDownDb } = require('./util');

const request = async opt => requestPromise({ resolveWithFullResponse: true, json: true, ...opt });

const REALLY_LONG_TIME = 10000000000;
const TEST_TIMEOUT_MS = 100000;
jest.setTimeout(TEST_TIMEOUT_MS);

const describeWithAuth = process.env.GKB_DBS_PASS
    ? describe
    : describe.skip;

if (!process.env.GKB_DBS_PASS) {
    console.warn('Cannot run tests without database password (GKB_DBS_PASS)');
}

describeWithAuth('api read-only routes', () => {
    let db,
        app,
        mockToken,
        uri;

    beforeAll(async () => {
        db = await createSeededDb();
        const session = await db.pool.acquire();
        app = new AppServer({ ...db.conf, GKB_DB_CREATE: false, GKB_DISABLE_AUTH: true });

        await app.listen();
        uri = `${app.url}/query`;
        mockToken = await generateToken(
            session,
            db.admin.name,
            app.conf.GKB_KEY,
            REALLY_LONG_TIME,
        );
        await session.close();
    });

    afterAll(async () => {
        if (app) {
            await app.close(); // shut down the http server
        }
        await tearDownDb({ server: db.server, conf: db.conf }); // destroy the test db
        // close the db connections so that you can create more in the app.listen
        await db.pool.close();
        await db.server.close();
    });

    describe('/stats', () => {
        test('default to only active records', async () => {
            const response = await request({
                uri: `${app.url}/stats`,
                method: 'GET',
                headers: { Authorization: mockToken },
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('result');
            expect(response.body.result).toHaveProperty('User', 1);
            expect(response.body.result).not.toHaveProperty('ProteinPosition'); // ignore embedded
            expect(response.body.result).not.toHaveProperty('Variant'); // ignore abstract
            expect(response.body.result).toHaveProperty('Disease', 3); // ignore deleted
        });

        test('include deleted records when history flag is true', async () => {
            const response = await request({
                uri: `${app.url}/stats`,
                qs: { history: true },
                method: 'GET',
                headers: { Authorization: mockToken },
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('result');
            expect(response.body.result).toHaveProperty('User', 1);
            expect(response.body.result).not.toHaveProperty('ProteinPosition'); // ignore embedded
            expect(response.body.result).not.toHaveProperty('Variant'); // ignore abstract
            expect(response.body.result).toHaveProperty('Disease', 4); // include deleted
        });

        test('error on bad std option', async () => {
            try {
                await request({
                    uri: `${app.url}/stats`,
                    qs: { history: 'k' },
                    method: 'GET',
                    headers: { Authorization: mockToken },
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });
    });

    describe('/version', () => {
        test('GET without Auth', async () => {
            const response = await request({ uri: `${app.url}/version`, method: 'GET' });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('api', expect.stringMatching(/^\d+\.\d+\.\d+$/));
            expect(response.body).toHaveProperty('db');
            expect(response.body).toHaveProperty('schema');
        });
    });

    describe('/query search statements by keyword', () => {
        test('count ignores limit', async () => {
            const response = await request({
                uri,
                method: 'POST',
                headers: { Authorization: mockToken },
                body: {
                    keyword: 'kras',
                    target: 'Statement',
                    queryType: 'keyword',
                    limit: 1,
                    count: true,
                },
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('result');
            expect(response.body).toEqual({ result: [{ count: 2 }], metadata: { records: 1 } });
        });

        test('get from related variant reference', async () => {
            const response = await request({
                uri,
                method: 'POST',
                headers: { Authorization: mockToken },
                body: {
                    keyword: 'kras',
                    target: 'Statement',
                    queryType: 'keyword',
                },
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('result');
            expect(response.body.result).toHaveProperty('length', 2);
        });

        test('multiple keywords are co-required', async () => {
            const response = await request({
                uri,
                method: 'POST',
                headers: { Authorization: mockToken },
                body: {
                    keyword: 'kras,resistance',
                    target: 'Statement',
                    queryType: 'keyword',
                },
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('result');
            expect(response.body.result).toHaveProperty('length', 0);
        });

        test('error on no body', async () => {
            try {
                await request({
                    uri,
                    method: 'POST',
                    headers: { Authorization: mockToken },
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });

        test('error on any keyword too short', async () => {
            try {
                await request({
                    uri,
                    method: 'POST',
                    headers: { Authorization: mockToken },
                    body: { keyword: 'kras m', target: 'Statement', queryType: 'keyword' },
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });

        test('error on bad std option', async () => {
            try {
                await request({
                    uri,
                    method: 'POST',
                    headers: { Authorization: mockToken },
                    body: {
                        keyword: 'kras', history: 'k', target: 'Statement', queryType: 'keyword',
                    },
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });
    });

    describe('/query', () => {
        test('empty target array is bad request', async () => {
            try {
                await request({
                    uri,
                    headers: {
                        Authorization: mockToken,
                    },
                    method: 'POST',
                    body: {
                        target: [],
                    },
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(response.body).toHaveProperty('name', 'ValidationError');
                return;
            }
            throw new Error('Did not throw expected error');
        });

        test('count ignores limit', async () => {
            const response = await request({
                uri,
                method: 'POST',
                body: {
                    target: 'Disease', filters: { subsets: 'singleSubset' }, count: true, limit: 1,
                },
                headers: { Authorization: mockToken },
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('result');
            expect(response.body).toEqual({ result: [{ count: 2 }], metadata: { records: 1 } });
        });

        test('apply skip', async () => {
            const response = await request({
                uri,
                method: 'POST',
                body: { target: 'Disease', skip: 1 },
                headers: { Authorization: mockToken },
            });
            expect(response.body.result).toHaveProperty('length', 2);
        });

        test('uses property name query parameter', async () => {
            const response = await request({
                uri,
                method: 'POST',
                body: { target: 'User', filters: { name: db.admin.name } },
                headers: { Authorization: mockToken },
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(Array.isArray(response.body.result)).toBe(true);
            expect(response.body.result.length).toBe(1);
            expect(response.body.result[0].name).toBe(db.admin.name);
        });

        test('aggregates if count flag is set', async () => {
            const response = await request({
                uri,
                method: 'POST',
                headers: { Authorization: mockToken },
                body: { target: 'User', count: true },
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body.result).toEqual([{ count: 1 }]);
        });

        test('query iterable property by single value', async () => {
            const resp = await request({
                uri,
                method: 'POST',
                body: { target: 'Ontology', filters: { subsets: 'singleSubset' } },
                headers: { Authorization: mockToken },
            });
            expect(resp.body).toHaveProperty('result');
            expect(resp.body.result).toHaveProperty('length', 2);
        });

        test('set count flag true with t', async () => {
            const { body: { result } } = await request({
                uri,
                headers: {
                    Authorization: mockToken,
                },
                method: 'POST',
                body: {
                    target: 'Feature',
                    count: 't',
                },
            });
            expect(result).toEqual([{ count: 2 }]);
        });

        test('error on property validation failure', async () => {
            try {
                await request({
                    uri,
                    headers: {
                        Authorization: mockToken,
                    },
                    method: 'POST',
                    body: {
                        target: 'Feature',
                        filters: { biotype: 'blargh' },
                    },
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(response.body).toHaveProperty('name', 'ValidationError');
                return;
            }
            throw new Error('Did not throw expected error');
        });

        test('error on validation failure of standard option: neighbors', async () => {
            try {
                await request({
                    uri,
                    headers: {
                        Authorization: mockToken,
                    },
                    method: 'POST',
                    body: {
                        target: 'Feature',
                        neighbors: -1,
                    },
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(response.body).toHaveProperty('name', 'ValidationError');
                return;
            }

            throw new Error('Did not throw expected error');
        });

        test('history is excluded by default', async () => {
            const response = await request({
                uri,
                method: 'POST',
                body: {
                    neighbors: 2,
                    target: 'Disease',
                },
                headers: { Authorization: mockToken },
            });
            expect(response.body.result).toHaveProperty('length', 3);
            const resWithDeleted = await request({
                uri,
                method: 'POST',
                body: {
                    neighbors: 2,
                    target: 'Disease',
                    history: true,
                },
                headers: { Authorization: mockToken },
            });
            expect(resWithDeleted.body.result).toHaveProperty('length', 4);
        });

        test('containstext is case non-sensitive', async () => {
            const response = await request({
                uri,
                method: 'POST',
                body: { target: 'Disease', filters: { sourceId: 'CAncer' } },
                headers: { Authorization: mockToken },
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body.result).toHaveProperty('length', 1);
        });
    });

    describe('/:model/:rid', () => {
        test('error on invalid rid', async () => {
            try {
                await request({
                    uri: `${app.url}/features/kme`,
                    headers: {
                        Authorization: mockToken,
                    },
                    method: 'GET',
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(response.body).toHaveProperty('name', 'ValidationError');
                return;
            }
            throw new Error('Did not throw expected error');
        });

        test('ok with rid with hash prefix', async () => {
            const { records: { kras: { '@rid': rid } } } = db;
            const response = await request({
                uri: `${app.url}/features/${encodeURIComponent(rid.toString())}`,
                headers: {
                    Authorization: mockToken,
                },
                method: 'GET',
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('result');
            expect(response.body.result).toHaveProperty('@rid', rid.toString());
        });

        test('ok with rid without hash prefix', async () => {
            const { records: { kras: { '@rid': rid } } } = db;
            const response = await request({
                uri: `${app.url}/features/${rid.toString().slice(1)}`,
                headers: {
                    Authorization: mockToken,
                },
                method: 'GET',
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('result');
            expect(response.body.result).toHaveProperty('@rid', rid.toString());
        });

        test('error on non-existant rid', async () => {
            try {
                await request({
                    uri: `${app.url}/features/4444:2235252`,
                    method: 'GET',
                    headers: { Authorization: mockToken },
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
                return;
            }
            throw new Error('Did not throw expected error');
        });

        test('error on query param', async () => {
            const { records: { kras: { '@rid': rid } } } = db;

            try {
                await request({
                    uri: `${app.url}/features/${encodeURIComponent(rid)}`,
                    method: 'GET',
                    headers: { Authorization: mockToken },
                    qs: { history: true },
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });
    });

    describe('/query target recordslist', () => {
        let record1,
            record2,
            deletedRecord;

        beforeEach(() => {
            const { records: { cancer, carcinoma } } = db;
            record1 = cancer['@rid'];
            record2 = carcinoma['@rid'];
            deletedRecord = carcinoma.history['@rid'] || carcinoma.history;
        });

        test('ok for 2 existing records', async () => {
            const response = await request({
                uri,
                method: 'POST',
                body: { target: [record1, record2] },
                headers: { Authorization: mockToken },
            });
            expect(response.body.result).toHaveProperty('length', 2);
        });

        test('fails for properly formatted non-existant cluster RID', async () => {
            try {
                await request({
                    uri,
                    method: 'POST',
                    body: { target: [record1, '1111:1111'] },
                    headers: { Authorization: mockToken },
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
                expect(response.body).toHaveProperty('message');
                expect(response.body.message).toContain('expected 2 records but only found 1');
                return;
            }
            throw new Error('Did not throw the expected error');
        });

        test('errors on missing non-existant RID on a valid cluster', async () => {
            try {
                await request({
                    uri,
                    method: 'POST',
                    body: { target: [record1, '1:1111'] },
                    headers: { Authorization: mockToken },
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
                expect(response.body).toHaveProperty('message');
                expect(response.body.message).toContain('expected 2 records but only found 1');
                return;
            }
            throw new Error('Did not throw the expected error');
        });

        test('error on bad neighbors argument', async () => {
            try {
                await request({
                    uri,
                    method: 'POST',
                    body: {
                        target: [record1],
                        neighbors: 'k',
                    },
                    headers: { Authorization: mockToken },
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(response.body).toHaveProperty('message');
                expect(response.body.message).toContain('k is not a valid integer');
                return;
            }
            throw new Error('Did not throw the expected error');
        });

        test('error on malformed RID', async () => {
            try {
                await request({
                    uri,
                    method: 'POST',
                    body: {
                        target: [record1, '7'],
                    },
                    headers: { Authorization: mockToken },
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(response.body).toHaveProperty('message');
                expect(response.body.message).toContain('not a valid RID');
                return;
            }

            throw new Error('Did not throw the expected error');
        });

        test('errors on deleted records', async () => {
            try {
                await request({
                    uri,
                    method: 'POST',
                    body: { target: [record1, record2, deletedRecord] },
                    headers: { Authorization: mockToken },
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
                expect(response.body).toHaveProperty('message');
                expect(response.body.message).toContain('expected 3 records but only found 2');
                return;
            }
            throw new Error('Did not throw the expected error');
        });

        test('includes deleted records when history true', async () => {
            const response = await request({
                uri,
                method: 'POST',
                body: {
                    target: [record1, record2, deletedRecord],
                    history: true,
                },
                headers: { Authorization: mockToken },
            });
            expect(response.body.result).toHaveProperty('length', 3);
        });
    });
});
