/**
 * Tests for building read only queries including their routing
 */
const requestPromise = require('request-promise');
const HTTP_STATUS = require('http-status-codes');

const {AppServer} = require('../../app');
const {generateToken} = require('../../app/routes/auth');

const {createSeededDb, tearDownDb} = require('./util');

const request = async opt => requestPromise({resolveWithFullResponse: true, json: true, ...opt});

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
        mockToken;
    beforeAll(async () => {
        db = await createSeededDb();
        const session = await db.pool.acquire();
        app = new AppServer({...db.conf, GKB_DB_CREATE: false, GKB_DISABLE_AUTH: true});

        await app.listen();
        mockToken = await generateToken(
            session,
            db.admin.name,
            app.conf.GKB_KEY,
            REALLY_LONG_TIME
        );
        await session.close();
    });
    afterAll(async () => {
        if (app) {
            await app.close(); // shut down the http server
        }
        await tearDownDb({server: db.server, conf: db.conf}); // destroy the test db
        // close the db connections so that you can create more in the app.listen
        await db.pool.close();
        await db.server.close();
    });

    describe('/stats', () => {
        test('default to only active records', async () => {
            const response = await request({
                uri: `${app.url}/stats`,
                method: 'GET',
                headers: {Authorization: mockToken}
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('result');
            expect(response.body.result).toHaveProperty('User', 1);
            expect(response.body.result).not.toHaveProperty('ProteinPosition'); // ignore embedded
            expect(response.body.result).not.toHaveProperty('Variant'); // ignore abstract
            expect(response.body.result).toHaveProperty('Disease', 3); // ignore deleted
        });
        test('include deleted records when activeOnly flag is false', async () => {
            const response = await request({
                uri: `${app.url}/stats`,
                qs: {activeOnly: false},
                method: 'GET',
                headers: {Authorization: mockToken}
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
                    qs: {activeOnly: 'k'},
                    method: 'GET',
                    headers: {Authorization: mockToken}
                });
            } catch ({response}) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });
    });

    describe('/version', () => {
        test('GET without Auth', async () => {
            const response = await request({uri: `${app.url}/version`, method: 'GET'});
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('api', expect.stringMatching(/^\d+\.\d+\.\d+$/));
            expect(response.body).toHaveProperty('db');
            expect(response.body).toHaveProperty('schema');
        });
    });

    describe('/statements/search?keyword', () => {
        test('count ignores limit', async () => {
            const response = await request({
                uri: `${app.url}/statements/search`,
                method: 'GET',
                headers: {Authorization: mockToken},
                qs: {keyword: 'kras', limit: 1, count: true}
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('result');
            expect(response.body).toEqual({result: [{count: 2}]});
        });
        test('get from related variant reference', async () => {
            const response = await request({
                uri: `${app.url}/statements/search`,
                method: 'GET',
                headers: {Authorization: mockToken},
                qs: {keyword: 'kras'}
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('result');
            expect(response.body.result).toHaveProperty('length', 2);
        });
        test('multiple keywords are co-required', async () => {
            const response = await request({
                uri: `${app.url}/statements/search`,
                method: 'GET',
                headers: {Authorization: mockToken},
                qs: {keyword: 'kras,resistance'}
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('result');
            expect(response.body.result).toHaveProperty('length', 0);
        });
        test('error on no keyword', async () => {
            try {
                await request({
                    uri: `${app.url}/statements/search`,
                    method: 'GET',
                    headers: {Authorization: mockToken}
                });
            } catch ({response}) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });
        test('error on any keyword too short', async () => {
            try {
                await request({
                    uri: `${app.url}/statements/search`,
                    method: 'GET',
                    headers: {Authorization: mockToken},
                    qs: {keyword: 'kras m'}
                });
            } catch ({response}) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });
        test('error on bad std option', async () => {
            try {
                await request({
                    uri: `${app.url}/statements/search`,
                    method: 'GET',
                    headers: {Authorization: mockToken},
                    qs: {keyword: 'kras', activeOnly: 'k'}
                });
            } catch ({response}) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });
    });

    describe('/:model', () => {
        test('count ignores limit', async () => {
            const response = await request({
                uri: `${app.url}/ontologies`,
                method: 'GET',
                qs: {subsets: 'singleSubset', count: true, limit: 1},
                headers: {Authorization: mockToken}
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('result');
            expect(response.body).toEqual({result: [{count: 2}]});
        });
        test('uses property name query parameter', async () => {
            const response = await request({uri: `${app.url}/users?name=${db.admin.name}`, method: 'GET', headers: {Authorization: mockToken}});
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(Array.isArray(response.body.result)).toBe(true);
            expect(response.body.result.length).toBe(1);
            expect(response.body.result[0].name).toBe(db.admin.name);
        });
        test('aggregates if count flag is set', async () => {
            const response = await request({uri: `${app.url}/users?count=true`, method: 'GET', headers: {Authorization: mockToken}});
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body.result).toEqual([{count: 1}]);
        });
        test('query iterable property by single value', async () => {
            const resp = await request({
                uri: `${app.url}/ontologies`,
                method: 'GET',
                qs: {subsets: 'singleSubset'},
                headers: {Authorization: mockToken}
            });
            expect(resp.body).toHaveProperty('result');
            expect(resp.body.result).toHaveProperty('length', 2);
        });
        test('set count flag true with t', async () => {
            const {body: {result}} = await request({
                uri: `${app.url}/features`,
                headers: {
                    Authorization: mockToken
                },
                method: 'GET',
                qs: {
                    count: 't'
                }
            });
            expect(result).toEqual([{count: 2}]);
        });
        test('error on property validation failure', async () => {
            try {
                await request({
                    uri: `${app.url}/features`,
                    headers: {
                        Authorization: mockToken
                    },
                    method: 'GET',
                    qs: {
                        biotype: 'blargh'
                    }
                });
            } catch ({response}) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(response.body).toHaveProperty('name', 'ValidationError');
                return;
            }
            throw new Error('Did not throw expected error');
        });
        test('error on validation failure of standard option: neighbors', async () => {
            try {
                await request({
                    uri: `${app.url}/features`,
                    headers: {
                        Authorization: mockToken
                    },
                    method: 'GET',
                    qs: {
                        neighbors: -1
                    }
                });
            } catch ({response}) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(response.body).toHaveProperty('name', 'ValidationError');
                return;
            }

            throw new Error('Did not throw expected error');
        });
        test('activeOnly flag false includes deleted records', async () => {
            const response = await request({
                uri: `${app.url}/diseases`,
                method: 'GET',
                qs: {neighbors: 2},
                headers: {Authorization: mockToken}
            });
            expect(response.body.result).toHaveProperty('length', 3);
            const resWithDeleted = await request({
                uri: `${app.url}/diseases`,
                method: 'GET',
                qs: {neighbors: 2, activeOnly: false},
                headers: {Authorization: mockToken}
            });
            expect(resWithDeleted.body.result).toHaveProperty('length', 4);
        });
        test('use containstext with whitespace', async () => {
            const response = await request({
                uri: `${app.url}/diseases`,
                method: 'GET',
                qs: {sourceId: '~liver cancer'},
                headers: {Authorization: mockToken}
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body.result).toHaveProperty('length', 0);
        });
        test('containstext is case non-sensitive', async () => {
            const response = await request({
                uri: `${app.url}/diseases`,
                method: 'GET',
                qs: {sourceId: '~CAncer'},
                headers: {Authorization: mockToken}
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
                        Authorization: mockToken
                    },
                    method: 'GET'
                });
            } catch ({response}) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(response.body).toHaveProperty('name', 'ValidationError');
                return;
            }
            throw new Error('Did not throw expected error');
        });
        test('ok with rid with hash prefix', async () => {
            const {records: {kras: {'@rid': rid}}} = db;
            const response = await request({
                uri: `${app.url}/features/${encodeURIComponent(rid.toString())}`,
                headers: {
                    Authorization: mockToken
                },
                method: 'GET'
            });
            expect(response.statusCode).toBe(HTTP_STATUS.OK);
            expect(response.body).toHaveProperty('result');
            expect(response.body.result).toHaveProperty('@rid', rid.toString());
        });
        test('ok with rid without hash prefix', async () => {
            const {records: {kras: {'@rid': rid}}} = db;
            const response = await request({
                uri: `${app.url}/features/${rid.toString().slice(1)}`,
                headers: {
                    Authorization: mockToken
                },
                method: 'GET'
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
                    headers: {Authorization: mockToken}
                });
            } catch ({response}) {
                expect(response.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
                return;
            }
            throw new Error('Did not throw expected error');
        });
        test('error on query param', async () => {
            const {records: {kras: {'@rid': rid}}} = db;
            try {
                await request({
                    uri: `${app.url}/features/${encodeURIComponent(rid)}`,
                    method: 'GET',
                    headers: {Authorization: mockToken},
                    qs: {activeOnly: true}
                });
            } catch ({response}) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });
    });

    describe('/:model/search', () => {
        test('error on both mutually exclusive search and where', async () => {
            try {
                await request({
                    uri: `${app.url}/diseases/search`,
                    method: 'POST',
                    body: {search: {}, where: {}},
                    headers: {Authorization: mockToken}
                });
            } catch ({response}) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });
        describe('basic search filters', () => {
            test('default active only', async () => {
                const response = await request({
                    uri: `${app.url}/diseases/search`,
                    method: 'POST',
                    body: {search: {}},
                    headers: {Authorization: mockToken}
                });
                expect(response.body.result).toHaveProperty('length', 3);
            });
            test('count ignores limit', async () => {
                const response = await request({
                    uri: `${app.url}/diseases/search`,
                    method: 'POST',
                    body: {search: {}, count: true, limit: 1},
                    headers: {Authorization: mockToken}
                });
                expect(response.statusCode).toBe(HTTP_STATUS.OK);
                expect(response.body).toEqual({result: [{count: 3}]});
            });
            test('error on bad std option', async () => {
                try {
                    await request({
                        uri: `${app.url}/diseases/search`,
                        method: 'POST',
                        body: {search: {}, activeOnly: 'k'},
                        headers: {Authorization: mockToken}
                    });
                } catch ({response}) {
                    expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                    return;
                }
                throw new Error('Did not throw expected error');
            });
            test('apply skip', async () => {
                const response = await request({
                    uri: `${app.url}/diseases/search`,
                    method: 'POST',
                    body: {search: {}, skip: 1},
                    headers: {Authorization: mockToken}
                });
                expect(response.body.result).toHaveProperty('length', 2);
            });
            test('error on bad filter type', async () => {
                try {
                    await request({
                        uri: `${app.url}/diseases/search`,
                        method: 'POST',
                        body: {search: {source: ['k']}},
                        headers: {Authorization: mockToken}
                    });
                } catch ({response}) {
                    expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                    return;
                }
                throw new Error('Did not throw expected error');
            });
            test('apply limit', async () => {
                const response = await request({
                    uri: `${app.url}/diseases/search`,
                    method: 'POST',
                    body: {search: {}, limit: 1},
                    headers: {Authorization: mockToken}
                });
                expect(response.body.result).toHaveProperty('length', 1);
            });
            test('retrieve deleted records', async () => {
                const response = await request({
                    uri: `${app.url}/diseases/search`,
                    method: 'POST',
                    body: {search: {}, activeOnly: false},
                    headers: {Authorization: mockToken}
                });
                expect(response.body.result).toHaveProperty('length', 4);
            });
            test.todo('throw error on neighbors');
            test.todo('allow ordering');
        });
        describe('query builder queries', () => {
            test.todo('error bad query form');
            test('simple single property query', async () => {
                const response = await request({
                    uri: `${app.url}/users/search`,
                    headers: {
                        Authorization: mockToken
                    },
                    method: 'POST',
                    body: {
                        where: [
                            {attr: 'name', value: db.admin.name}
                        ],
                        neighbors: 1,
                        limit: 10
                    }
                });
                expect(response.statusCode).toBe(HTTP_STATUS.OK);
                expect(Array.isArray(response.body.result)).toBe(true);
                expect(response.body.result.length).toBe(1);
                expect(response.body.result[0].name).toBe(db.admin.name);
            });
            test('error if query params given', async () => {
                try {
                    await request({
                        uri: `${app.url}/users/search`,
                        qs: {neighbors: 1},
                        headers: {
                            Authorization: mockToken
                        },
                        method: 'POST',
                        body: {
                            where: [
                                {attr: 'name', value: db.admin.name}
                            ],
                            neighbors: 1,
                            limit: 10
                        }
                    });
                } catch ({response}) {
                    expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                    expect(response.body).toHaveProperty('name', 'ValidationError');
                    return;
                }
                throw new Error('Did not throw expected error');
            });
            test('error bad query form', async () => {
                try {
                    await request({
                        uri: `${app.url}/sources/search`,
                        headers: {
                            Authorization: mockToken
                        },
                        method: 'POST',
                        body: {
                            where: [
                                {attr: 'blargh', value: '1'}
                            ],
                            neighbors: 1,
                            limit: 10
                        }
                    });
                } catch ({response}) {
                    expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                    expect(response.body).toHaveProperty('name', 'ValidationError');
                    return;
                }
                throw new Error('Did not throw expected error');
            });
            test('neighborhood subquery', async () => {
                const {records: {cancer}} = db;
                // should return the diease record and those linked to it
                const response = await request({
                    uri: `${app.url}/diseases/search`,
                    method: 'POST',
                    body: {
                        type: 'neighborhood',
                        where: {attr: 'sourceId', value: cancer.sourceId},
                        neighbors: 2

                    },
                    headers: {Authorization: mockToken}
                });
                expect(response.body.result).toHaveProperty('length', 3);
            });
            test('neighborhood subquery with specific edges', async () => {
                const {records: {cancer}} = db;
                // should return the diease record and those linked to it
                const response = await request({
                    uri: `${app.url}/diseases/search`,
                    method: 'POST',
                    body: {
                        type: 'neighborhood',
                        where: {attr: 'sourceId', value: cancer.sourceId},
                        edges: ['AliasOf'],
                        neighbors: 2

                    },
                    headers: {Authorization: mockToken}
                });
                expect(response.body.result).toHaveProperty('length', 2);
            });
        });
    });

    describe('/records', () => {
        let record1,
            record2,
            deletedRecord;
        beforeEach(() => {
            const {records: {cancer, carcinoma}} = db;
            record1 = cancer['@rid'];
            record2 = carcinoma['@rid'];
            deletedRecord = carcinoma.history['@rid'] || carcinoma.history;
        });
        test('ok for 2 existing records', async () => {
            const response = await request({
                uri: `${app.url}/records`,
                method: 'GET',
                qs: {rid: `${record1},${record2}`},
                headers: {Authorization: mockToken}
            });
            expect(response.body.result).toHaveProperty('length', 2);
        });
        test('fails for properly formatted non-existant cluster RID', async () => {
            try {
                await request({
                    uri: `${app.url}/records`,
                    method: 'GET',
                    qs: {rid: `${record1},1111:1111`},
                    headers: {Authorization: mockToken}
                });
            } catch ({response}) {
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
                    uri: `${app.url}/records`,
                    method: 'GET',
                    qs: {rid: `${record1},1:1111`},
                    headers: {Authorization: mockToken}
                });
            } catch ({response}) {
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
                    uri: `${app.url}/records`,
                    method: 'GET',
                    qs: {
                        rid: `${record1}`,
                        neighbors: 'k'
                    },
                    headers: {Authorization: mockToken}
                });
            } catch ({response}) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(response.body).toHaveProperty('message');
                expect(response.body.message).toContain('k is not a valid integer');
                return;
            }
            throw new Error('Did not throw the expected error');
        });
        test('error on unrecognized argument', async () => {
            try {
                await request({
                    uri: `${app.url}/records`,
                    method: 'GET',
                    qs: {
                        rid: `${record1}`,
                        limit: 100
                    },
                    headers: {Authorization: mockToken}
                });
            } catch ({response}) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(response.body).toHaveProperty('message');
                expect(response.body.message).toContain('Invalid query parameter(s) (limit)');
                return;
            }

            throw new Error('Did not throw the expected error');
        });
        test('error on malformed RID', async () => {
            try {
                await request({
                    uri: `${app.url}/records`,
                    method: 'GET',
                    qs: {
                        rid: `${record1},7`
                    },
                    headers: {Authorization: mockToken}
                });
            } catch ({response}) {
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
                    uri: `${app.url}/records`,
                    method: 'GET',
                    qs: {rid: `${record1},${record2},${deletedRecord}`},
                    headers: {Authorization: mockToken}
                });
            } catch ({response}) {
                expect(response.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
                expect(response.body).toHaveProperty('message');
                expect(response.body.message).toContain('expected 3 records but only found 2');
                return;
            }
            throw new Error('Did not throw the expected error');
        });
        test('includes deleted records when activeOnly off', async () => {
            const response = await request({
                uri: `${app.url}/records`,
                method: 'GET',
                qs: {
                    rid: `${record1},${record2},${deletedRecord}`,
                    activeOnly: false
                },
                headers: {Authorization: mockToken}
            });
            expect(response.body.result).toHaveProperty('length', 3);
        });
    });
});
