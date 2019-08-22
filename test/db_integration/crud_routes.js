/**
 * Tests for building read only queries including their routing
 */
const requestPromise = require('request-promise');
const HTTP_STATUS = require('http-status-codes');

const {AppServer} = require('../../app');
const {generateToken} = require('../../app/routes/auth');

const {createEmptyDb, tearDownDb, clearDB} = require('./util');

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

describeWithAuth('api crud routes', () => {
    let db,
        app,
        mockToken,
        session;

    beforeAll(async () => {
        db = await createEmptyDb();
        session = await db.pool.acquire();

        app = new AppServer({...db.conf, GKB_DB_CREATE: false, GKB_DISABLE_AUTH: true});

        await app.listen();
        mockToken = await generateToken(
            session,
            db.admin.name,
            app.conf.GKB_KEY,
            REALLY_LONG_TIME
        );
    });
    afterAll(async () => {
        if (app) {
            await app.close(); // shut down the http server
        }
        await session.close();
        await tearDownDb({server: db.server, conf: db.conf}); // destroy the test db
    });
    afterEach(async () => {
        await clearDB({session, admin: db.admin});
    });

    describe('/:model create new record', () => {
        describe('post/create', () => {
            test('create new', async () => {
                const res = await request({
                    uri: `${app.url}/users`,
                    body: {
                        name: 'blargh monkeys'
                    },
                    method: 'POST',
                    headers: {
                        Authorization: mockToken
                    }
                });
                expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
                expect(typeof res.body.result).toBe('object');
                expect(res.body.result.name).toBe('blargh monkeys');
            });
            test('error on query params given', async () => {
                try {
                    await request({
                        uri: `${app.url}/users`,
                        body: {
                            name: 'blargh monkeys'
                        },
                        method: 'POST',
                        headers: {
                            Authorization: mockToken
                        },
                        qs: {activeOnly: true}
                    });
                } catch (err) {
                    const res = err.response;
                    expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                    return;
                }
                throw new Error('Did not throw expected error');
            });
            test('error on missing required property', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/users`,
                        body: {
                        },
                        method: 'POST',
                        headers: {
                            Authorization: mockToken
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('name', 'ValidationError');
            });
            test('error on missing token', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/users`,
                        body: {
                            name: 'blargh monkeys'
                        },
                        method: 'POST'
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
            });
            test('error on duplicate record conflict', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/users`,
                        headers: {
                            Authorization: mockToken
                        },
                        method: 'POST',
                        body: {
                            name: db.admin.name
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.CONFLICT);
            });
            test('create record with embedded property', async () => {
                const {body: {result}} = await request({
                    uri: `${app.url}/usergroups`,
                    headers: {
                        Authorization: mockToken
                    },
                    method: 'POST',
                    body: {
                        name: 'wonderland',
                        permissions: {V: 15}
                    }
                });
                expect(result).toHaveProperty('createdAt');
                expect(result).toHaveProperty('@class', 'UserGroup');
                expect(result.permissions).toHaveProperty('@class', 'Permissions');
            });
        });
    });

    describe('/:model create new linked record', () => {
        let type,
            reference1,
            source;
        beforeEach(async () => {
            const res = await request({
                uri: `${app.url}/sources`,
                method: 'POST',
                body: {
                    name: 'bcgsc',
                    version: '2018'
                },
                headers: {Authorization: mockToken}
            });
            source = res.body.result;
            type = (await request({
                uri: `${app.url}/vocabulary`,
                body: {
                    sourceId: 'variantType',
                    name: 'variantType',
                    source
                },
                headers: {Authorization: mockToken},
                method: 'POST'
            })).body.result['@rid'];
            reference1 = (await request({
                uri: `${app.url}/features`,
                body: {
                    sourceId: 'variantReference',
                    name: 'variantReference',
                    biotype: 'gene',
                    source
                },
                headers: {Authorization: mockToken},
                method: 'POST'
            })).body.result['@rid'];
        });
        test('create record with link property', async () => {
            const res = await request({
                uri: `${app.url}/diseases`,
                headers: {
                    Authorization: mockToken
                },
                method: 'POST',
                body: {
                    sourceId: 'cancer',
                    source
                }
            });
            expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
            expect(typeof res.body.result).toBe('object');
            expect(res.body.result).toHaveProperty('sourceId', 'cancer');
            expect(res.body.result.source).toEqual(source['@rid']);
        });
        test('create record with embedded class property', async () => {
            const resp = await request({
                uri: `${app.url}/positionalvariants`,
                body: {
                    untemplatedSeq: 'R',
                    untemplatedSeqSize: 1,
                    type,
                    break1Start: {
                        '@class': 'ProteinPosition',
                        refAA: 'G',
                        pos: 12
                    },
                    reference1,
                    refSeq: 'G',
                    break1Repr: 'p.G12',
                    reference2: null
                },
                headers: {Authorization: mockToken},
                method: 'POST'
            });
            expect(resp.statusCode).toBe(HTTP_STATUS.CREATED);
        });
    });

    describe('/:model/:rid', () => {
        describe('patch/update', () => {
            let readyOnly,
                adminGroup,
                user,
                group;
            beforeEach(async () => {
                const res = await request({
                    uri: `${app.url}/usergroups`,
                    headers: {
                        Authorization: mockToken
                    },
                    method: 'GET'
                });
                readyOnly = res.body.result.find(g => g.name === 'readonly');
                adminGroup = res.body.result.find(g => g.name === 'admin');
                if (!readyOnly || !adminGroup) {
                    throw new Error('failed to find the readonly and admin user groups');
                }
                user = (await request({
                    uri: `${app.url}/users`,
                    method: 'POST',
                    body: {
                        name: 'alice',
                        groups: [readyOnly['@rid']]
                    },
                    headers: {Authorization: mockToken}
                })
                ).body.result;
                const {body: {result}} = await request({
                    uri: `${app.url}/usergroups`,
                    headers: {
                        Authorization: mockToken
                    },
                    method: 'POST',
                    body: {
                        name: 'wonderland',
                        permissions: {V: 15}
                    }
                });
                group = result;
            });
            test('update a linkset property', async () => {
                const {body: {result}} = await request({
                    uri: `${app.url}/users/${user['@rid'].slice(1)}`,
                    headers: {
                        Authorization: mockToken
                    },
                    body: {groups: [adminGroup['@rid']]},
                    method: 'PATCH'
                });
                expect(result).toHaveProperty('groups');
                expect(result.groups).toHaveProperty('length', 1);
                expect(result.groups[0]).toBe(adminGroup['@rid']);
                expect(result).toHaveProperty('name', 'alice');
            });
            test('update a required and indexed property', async () => {
                const {body: {result}} = await request({
                    uri: `${app.url}/users/${user['@rid'].slice(1)}`,
                    headers: {
                        Authorization: mockToken
                    },
                    body: {name: 'bob'},
                    method: 'PATCH'
                });
                expect(result).toHaveProperty('groups');
                expect(result.groups).toHaveProperty('length', 1);
                expect(result.groups[0]).toBe(readyOnly['@rid']);
                expect(result).toHaveProperty('name', 'bob');
            });
            test('update an embedded property', async () => {
                const {body: {result}} = await request({
                    uri: `${app.url}/usergroups/${group['@rid'].toString().slice(1)}`,
                    headers: {
                        Authorization: mockToken
                    },
                    method: 'PATCH',
                    body: {
                        permissions: {V: 15, E: 15}
                    }
                });
                expect(result).toHaveProperty('@rid', group['@rid'].toString());
                expect(result).toHaveProperty('history');
            });
            test('error on update non-existant rid', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/diseases/456:0`,
                        body: {
                            sourceId: 'cancer'
                        },
                        method: 'PATCH',
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
                expect(res.body).toHaveProperty('name', 'NoRecordFoundError');
            });
            test('error on update conflict', async () => {
                let res = await request({
                    uri: `${app.url}/users`,
                    body: {
                        name: 'dummy'
                    },
                    method: 'POST',
                    headers: {Authorization: mockToken}
                });
                expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
                const {body: {result: {'@rid': original}}} = res;

                try {
                    res = await request({
                        uri: `${app.url}/users/${encodeURIComponent(original)}`,
                        body: {
                            name: db.admin.name
                        },
                        method: 'PATCH',
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.CONFLICT);
            });
        });
        describe('delete', () => {
            let readyOnly,
                adminGroup,
                user;
            beforeEach(async () => {
                const res = await request({
                    uri: `${app.url}/usergroups`,
                    headers: {
                        Authorization: mockToken
                    }
                });
                for (const group of res.body.result) {
                    if (group.name === 'readonly') {
                        readyOnly = group;
                    } else if (group.name === 'admin') {
                        adminGroup = group;
                    }
                }
                if (!readyOnly || !adminGroup) {
                    throw new Error('failed to find the readonly and admin user groups');
                }
                user = (await request({
                    uri: `${app.url}/users`,
                    body: {
                        name: 'alice',
                        groups: [readyOnly['@rid']]
                    },
                    method: 'POST',
                    headers: {
                        Authorization: mockToken
                    }
                })).body.result;
            });
            test('delete the current user', async () => {
                const {body: {result}} = await request({
                    uri: `${app.url}/users/${user['@rid'].slice(1)}`,
                    headers: {
                        Authorization: mockToken
                    },
                    method: 'DELETE'
                });
                expect(result).toHaveProperty('deletedAt');
                expect(result.deletedBy).toBe(db.admin['@rid'].toString());
            });
            test('error on delete non-existant record', async () => {
                try {
                    await request({
                        uri: `${app.url}/diseases/456:0`,
                        method: 'DELETE',
                        headers: {Authorization: mockToken}
                    });
                } catch ({response: res}) {
                    expect(res.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
                    expect(res.body).toHaveProperty('name', 'NoRecordFoundError');
                    return;
                }
                throw new Error('Did not throw expected error');
            });
            test('error on malformed rid', async () => {
                try {
                    await request({
                        uri: `${app.url}/diseases/k`,
                        method: 'DELETE',
                        headers: {Authorization: mockToken}
                    });
                } catch ({response: res}) {
                    expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                    expect(res.body).toHaveProperty('name', 'ValidationError');
                    return;
                }
                throw new Error('Did not throw expected error');
            });
            test('error query params given', async () => {
                try {
                    await request({
                        uri: `${app.url}/diseases/456:0`,
                        method: 'DELETE',
                        qs: {activeOnly: true},
                        headers: {Authorization: mockToken}
                    });
                } catch ({response: res}) {
                    expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                    expect(res.body).toHaveProperty('name', 'ValidationError');
                    return;
                }
                throw new Error('Did not throw expected error');
            });
        });
    });
});
