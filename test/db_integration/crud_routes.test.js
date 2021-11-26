/**
 * Tests for building read only queries including their routing
 */
const requestPromise = require('request-promise');
const HTTP_STATUS = require('http-status-codes');
const { util: { timeStampNow } } = require('@bcgsc-pori/graphkb-schema');

const { AppServer } = require('../../src');
const { createUser } = require('../../src/repo/commands/create');
const { generateToken } = require('../../src/routes/auth');
const { createEmptyDb, tearDownDb, clearDB } = require('./util');

const request = async (opt) => requestPromise({ json: true, resolveWithFullResponse: true, ...opt });

const REALLY_LONG_TIME = 10000000000;
const TEST_TIMEOUT_MS = 100000;
jest.setTimeout(TEST_TIMEOUT_MS);
const PUBLIC_KEY = 'test/data/test_key.pem';
const GKB_KEYCLOAK_ROLE = 'monkeys';

// fake the KC token
jest.mock('../../src/routes/keycloak', () => {
    const fs = require('fs'); // eslint-disable-line
    const jwt = require('jsonwebtoken');  // eslint-disable-line
    const PRIVATE_KEY = fs.readFileSync('test/data/test_key');

    return {
        fetchToken: async (username) => {
            const token = jwt.sign(
                {
                    preferred_username: username,
                    realm_access: {
                        roles: ['monkeys'],
                    },
                },
                PRIVATE_KEY,
                { algorithm: 'RS256', expiresIn: 10000000000 },
            );
            return token;
        },
    };
});

const describeWithAuth = process.env.GKB_DBS_PASS
    ? describe
    : describe.skip;

if (!process.env.GKB_DBS_PASS) {
    console.warn('Cannot run tests without database password (GKB_DBS_PASS)');
}

const variantSetup = async ({ adminUserToken, app }) => {
    const res = await request({
        body: {
            name: 'bcgsc',
            version: '2018',
        },
        headers: { Authorization: adminUserToken },
        method: 'POST',
        uri: `${app.url}/sources`,
    });
    const source = res.body.result;
    const type = (await request({
        body: {
            name: 'variantType',
            source,
            sourceId: 'variantType',
        },
        headers: { Authorization: adminUserToken },
        method: 'POST',
        uri: `${app.url}/vocabulary`,
    })).body.result['@rid'];
    const reference1 = (await request({
        body: {
            biotype: 'gene',
            name: 'variantReference',
            source,
            sourceId: 'variantReference',
        },
        headers: { Authorization: adminUserToken },
        method: 'POST',
        uri: `${app.url}/features`,
    })).body.result['@rid'];

    return { reference1, source, type };
};

describeWithAuth('api crud routes', () => {
    let db,
        app,
        adminUserToken,
        session;

    beforeAll(async () => {
        db = await createEmptyDb();
        app = new AppServer({
            ...db.conf,
            GKB_DB_CREATE: false,
            GKB_DISABLE_AUTH: false,
            GKB_KEYCLOAK_KEY_FILE: PUBLIC_KEY,
            GKB_KEYCLOAK_ROLE,
        });
        await app.listen();
        session = await app.pool.acquire();
        adminUserToken = await generateToken(
            session,
            db.admin.name,
            app.conf.GKB_KEY,
            REALLY_LONG_TIME,
        );
    });

    afterAll(async () => {
        await session.close();

        if (app) {
            await app.close(); // shut down the http server
        }
        await tearDownDb({ conf: db.conf, server: db.server }); // destroy the test db
        // close the db connections so that you can create more in the app.listen
        await db.pool.close();
        await db.server.close();
    });

    afterEach(async () => {
        await clearDB({ admin: db.admin, session });
    });

    describe('/token', () => {
        test('login with username/password', async () => {
            const res = await request({
                body: {
                    password: 'anything',
                    username: db.admin.name,
                },
                method: 'POST',
                uri: `${app.url}/token`,
            });
            expect(res.statusCode).toBe(HTTP_STATUS.OK);
            expect(res.body).toHaveProperty('kbToken');
            expect(res.body).toHaveProperty('keyCloakToken');
        });

        test('error on missing username', async () => {
            try {
                await request({
                    body: {
                        password: 'anything',
                    },
                    method: 'POST',
                    uri: `${app.url}/token`,
                });
            } catch (err) {
                const res = err.response;
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });

        test('error on missing password', async () => {
            try {
                await request({
                    body: {
                        username: db.admin.name,
                    },
                    method: 'POST',
                    uri: `${app.url}/token`,
                });
            } catch (err) {
                const res = err.response;
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });
    });

    describe('/:model create new record', () => {
        describe('post/create', () => {
            test('create new', async () => {
                const res = await request({
                    body: {
                        name: 'blargh monkeys',
                    },
                    headers: {
                        Authorization: adminUserToken,
                    },
                    method: 'POST',
                    uri: `${app.url}/users`,
                });
                expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
                expect(typeof res.body.result).toBe('object');
                expect(res.body.result.name).toBe('blargh monkeys');
            });

            test('error on query params given', async () => {
                try {
                    await request({
                        body: {
                            name: 'blargh monkeys',
                        },
                        headers: {
                            Authorization: adminUserToken,
                        },
                        method: 'POST',
                        qs: { history: true },
                        uri: `${app.url}/users`,
                    });
                } catch (err) {
                    const res = err.response;
                    expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                    return;
                }
                throw new Error('Did not throw expected error');
            });

            test('error on missing required property', async () => {
                try {
                    await request({
                        body: {
                        },
                        headers: {
                            Authorization: adminUserToken,
                        },
                        method: 'POST',
                        uri: `${app.url}/users`,
                    });
                } catch ({ response }) {
                    expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                    expect(response.body).toHaveProperty('name', 'ValidationError');
                    return;
                }
                throw new Error('Did not throw expected error');
            });

            test('error on missing token', async () => {
                try {
                    await request({
                        body: {
                            name: 'blargh monkeys',
                        },
                        method: 'POST',
                        uri: `${app.url}/users`,
                    });
                } catch ({ response }) {
                    expect(response.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
                    return;
                }
                throw new Error('Did not throw expected error');
            });

            test('error on duplicate record conflict', async () => {
                try {
                    await request({
                        body: {
                            name: db.admin.name,
                        },
                        headers: {
                            Authorization: adminUserToken,
                        },
                        method: 'POST',
                        uri: `${app.url}/users`,
                    });
                } catch ({ response }) {
                    expect(response.statusCode).toBe(HTTP_STATUS.CONFLICT);
                    return;
                }
                throw new Error('Did not throw expected error');
            });

            test('create record with embedded property', async () => {
                const { body: { result } } = await request({
                    body: {
                        name: 'wonderland',
                        permissions: { V: 15 },
                    },
                    headers: {
                        Authorization: adminUserToken,
                    },
                    method: 'POST',
                    uri: `${app.url}/usergroups`,
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
            ({ type, reference1, source } = await variantSetup({ adminUserToken, app }));
        });

        test('create record with link property', async () => {
            const res = await request({
                body: {
                    source,
                    sourceId: 'cancer',
                },
                headers: {
                    Authorization: adminUserToken,
                },
                method: 'POST',
                uri: `${app.url}/diseases`,
            });
            expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
            expect(typeof res.body.result).toBe('object');
            expect(res.body.result).toHaveProperty('sourceId', 'cancer');
            expect(res.body.result.source).toEqual(source['@rid']);
        });

        test('create record with embedded class property', async () => {
            const resp = await request({
                body: {
                    break1Repr: 'p.G12',
                    break1Start: {
                        '@class': 'ProteinPosition',
                        pos: 12,
                        refAA: 'G',
                    },
                    refSeq: 'G',
                    reference1,
                    reference2: null,
                    type,
                    untemplatedSeq: 'R',
                    untemplatedSeqSize: 1,
                },
                headers: { Authorization: adminUserToken },
                method: 'POST',
                uri: `${app.url}/positionalvariants`,
            });
            expect(resp.statusCode).toBe(HTTP_STATUS.CREATED);
            expect(resp.body).toHaveProperty('result');
            expect(resp.body.result).toHaveProperty('@rid');
            expect(resp.body.result).toHaveProperty('displayName', 'variantreference:p.G12varianttype');
        });
    });

    describe('/:model/:rid', () => {
        describe('patch/update', () => {
            let readOnly,
                adminGroup,
                user,
                group,
                variant;

            beforeEach(async () => {
                const res = await request({
                    body: { target: 'UserGroup' },
                    headers: {
                        Authorization: adminUserToken,
                    },
                    method: 'POST',
                    uri: `${app.url}/query`,
                });
                readOnly = res.body.result.find((g) => g.name === 'readonly');
                adminGroup = res.body.result.find((g) => g.name === 'admin');

                if (!readOnly || !adminGroup) {
                    console.error(res.body.result.map((r) => r.name), readOnly);
                    throw new Error('failed to find the readonly and admin user groups');
                }
                user = (await request({
                    body: {
                        groups: [readOnly['@rid']],
                        name: 'alice',
                    },
                    headers: { Authorization: adminUserToken },
                    method: 'POST',
                    uri: `${app.url}/users`,
                })
                ).body.result;
                const { body: { result } } = await request({
                    body: {
                        name: 'wonderland',
                        permissions: { V: 15 },
                    },
                    headers: {
                        Authorization: adminUserToken,
                    },
                    method: 'POST',
                    uri: `${app.url}/usergroups`,
                });
                group = result;

                const { type, reference1 } = await variantSetup({ adminUserToken, app });
                variant = (await request({
                    body: {
                        break1Repr: 'p.G12',
                        break1Start: {
                            '@class': 'ProteinPosition',
                            pos: 12,
                            refAA: 'G',
                        },
                        refSeq: 'G',
                        reference1,
                        reference2: null,
                        type,
                        untemplatedSeq: 'R',
                        untemplatedSeqSize: 1,
                    },
                    headers: { Authorization: adminUserToken },
                    method: 'POST',
                    uri: `${app.url}/positionalvariants`,
                })).body.result;
            });

            test('regenerates displayName on update if not given in changes', async () => {
                // original variant
                expect(variant).toHaveProperty('displayName', 'variantreference:p.G12varianttype');
                const { body: { result } } = await request({
                    body: { break1Start: { '@class': 'ProteinPosition', pos: 12, refAA: 'H' } },
                    headers: {
                        Authorization: adminUserToken,
                    },
                    method: 'PATCH',
                    uri: `${app.url}/positionalvariants/${variant['@rid'].slice(1)}`,
                });
                expect(result).toHaveProperty('displayName', 'variantreference:p.H12varianttype');
            });

            test('use displayName on update if given in changes', async () => {
                // original variant
                expect(variant).toHaveProperty('displayName', 'variantreference:p.G12varianttype');
                const { body: { result } } = await request({
                    body: { break1Start: { '@class': 'ProteinPosition', pos: 12, refAA: 'H' }, displayName: 'blargh' },
                    headers: {
                        Authorization: adminUserToken,
                    },
                    method: 'PATCH',
                    uri: `${app.url}/positionalvariants/${variant['@rid'].slice(1)}`,
                });
                expect(result).toHaveProperty('displayName', 'blargh');
                expect(result).toHaveProperty('break1Repr', 'p.H12');
            });

            test('update a linkset property', async () => {
                const { body: { result } } = await request({
                    body: { groups: [adminGroup['@rid']] },
                    headers: {
                        Authorization: adminUserToken,
                    },
                    method: 'PATCH',
                    uri: `${app.url}/users/${user['@rid'].slice(1)}`,
                });
                expect(result).toHaveProperty('groups');
                expect(result.groups).toHaveProperty('length', 1);
                expect(result.groups[0]).toBe(adminGroup['@rid']);
                expect(result).toHaveProperty('name', 'alice');
            });

            test('update a required and indexed property', async () => {
                const { body: { result } } = await request({
                    body: { name: 'bob' },
                    headers: {
                        Authorization: adminUserToken,
                    },
                    method: 'PATCH',
                    uri: `${app.url}/users/${user['@rid'].slice(1)}`,
                });
                expect(result).toHaveProperty('groups');
                expect(result.groups).toHaveProperty('length', 1);
                expect(result.groups[0]).toBe(readOnly['@rid']);
                expect(result).toHaveProperty('name', 'bob');
            });

            test('update an embedded property', async () => {
                const { body: { result } } = await request({
                    body: {
                        permissions: { E: 15, V: 15 },
                    },
                    headers: {
                        Authorization: adminUserToken,
                    },
                    method: 'PATCH',
                    uri: `${app.url}/usergroups/${group['@rid'].toString().slice(1)}`,
                });
                expect(result).toHaveProperty('@rid', group['@rid'].toString());
                expect(result).toHaveProperty('history');
            });

            test('error on update non-existant rid', async () => {
                let res;

                try {
                    res = await request({
                        body: {
                            sourceId: 'cancer',
                        },
                        headers: { Authorization: adminUserToken },
                        method: 'PATCH',
                        uri: `${app.url}/diseases/456:0`,
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
                expect(res.body).toHaveProperty('name', 'NoRecordFoundError');
            });

            test('error on update conflict', async () => {
                let res = await request({
                    body: {
                        name: 'dummy',
                    },
                    headers: { Authorization: adminUserToken },
                    method: 'POST',
                    uri: `${app.url}/users`,
                });
                expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
                const { body: { result: { '@rid': original } } } = res;

                try {
                    res = await request({
                        body: {
                            name: db.admin.name,
                        },
                        headers: { Authorization: adminUserToken },
                        method: 'PATCH',
                        uri: `${app.url}/users/${encodeURIComponent(original)}`,
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.CONFLICT);
            });
        });

        describe('delete', () => {
            let readOnly,
                adminGroup,
                user;

            beforeEach(async () => {
                const res = await request({
                    body: { target: 'UserGroup' },
                    headers: {
                        Authorization: adminUserToken,
                    },
                    method: 'POST',
                    uri: `${app.url}/query`,
                });

                for (const group of res.body.result) {
                    if (group.name === 'readonly') {
                        readOnly = group;
                    } else if (group.name === 'admin') {
                        adminGroup = group;
                    }
                }

                if (!readOnly || !adminGroup) {
                    throw new Error('failed to find the readonly and admin user groups');
                }
                user = (await request({
                    body: {
                        groups: [readOnly['@rid']],
                        name: 'alice',
                    },
                    headers: {
                        Authorization: adminUserToken,
                    },
                    method: 'POST',
                    uri: `${app.url}/users`,
                })).body.result;
            });

            test('delete the current user', async () => {
                const { body: { result } } = await request({
                    headers: {
                        Authorization: adminUserToken,
                    },
                    method: 'DELETE',
                    uri: `${app.url}/users/${user['@rid'].slice(1)}`,
                });
                expect(result).toHaveProperty('deletedAt');
                expect(result.deletedBy).toBe(db.admin['@rid'].toString());
            });

            test('error on delete non-existant record', async () => {
                try {
                    await request({
                        headers: { Authorization: adminUserToken },
                        method: 'DELETE',
                        uri: `${app.url}/diseases/456:0`,
                    });
                } catch ({ response: res }) {
                    expect(res.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
                    expect(res.body).toHaveProperty('name', 'NoRecordFoundError');
                    return;
                }
                throw new Error('Did not throw expected error');
            });

            test('error on malformed rid', async () => {
                try {
                    await request({
                        headers: { Authorization: adminUserToken },
                        method: 'DELETE',
                        uri: `${app.url}/diseases/k`,
                    });
                } catch ({ response: res }) {
                    expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                    expect(res.body).toHaveProperty('name', 'ValidationError');
                    return;
                }
                throw new Error('Did not throw expected error');
            });

            test('error query params given', async () => {
                try {
                    await request({
                        headers: { Authorization: adminUserToken },
                        method: 'DELETE',
                        qs: { history: true },
                        uri: `${app.url}/diseases/456:0`,
                    });
                } catch ({ response: res }) {
                    expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                    expect(res.body).toHaveProperty('name', 'ValidationError');
                    return;
                }
                throw new Error('Did not throw expected error');
            });
        });
    });

    describe('/license', () => {
        let managerUser,
            managerUserToken,
            unsignedUser,
            unsignedUserToken;

        beforeEach(async () => {
            [managerUser, unsignedUser] = await Promise.all([
                createUser(session, {
                    existsOk: true,
                    groupNames: ['manager'],
                    signedLicenseAt: timeStampNow(),
                    userName: 'manager',
                }),
                createUser(session, {
                    existsOk: true,
                    groupNames: ['manager'],
                    userName: 'unsigneduser',
                }),
            ]);
            [managerUserToken, unsignedUserToken] = await Promise.all([
                generateToken(
                    session,
                    managerUser.name,
                    app.conf.GKB_KEY,
                    REALLY_LONG_TIME,
                ),
                generateToken(
                    session,
                    unsignedUser.name,
                    app.conf.GKB_KEY,
                    REALLY_LONG_TIME,
                ),
            ]);
        });

        describe('GET', () => {
            test('signed user can see the license', async () => {
                const res = await request({
                    headers: {
                        Authorization: managerUserToken,
                    },
                    method: 'GET',
                    uri: `${app.url}/license`,
                });
                expect(res.statusCode).toBe(HTTP_STATUS.OK);
                expect(res.body).toHaveProperty('content');
                expect(res.body).toHaveProperty('enactedAt');
            });

            test('unsigned user can see the license', async () => {
                const res = await request({
                    headers: {
                        Authorization: unsignedUserToken,
                    },
                    method: 'GET',
                    uri: `${app.url}/license`,
                });
                expect(res.statusCode).toBe(HTTP_STATUS.OK);
                expect(res.body).toHaveProperty('content');
                expect(res.body).toHaveProperty('enactedAt');
            });
        });

        describe('POST', () => {
            test('create a new license', async () => {
                const res = await request({
                    headers: {
                        Authorization: adminUserToken,
                    },
                    method: 'POST',
                    uri: `${app.url}/license`,
                });
                expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
                expect(res.body).toHaveProperty('content');
                expect(res.body).toHaveProperty('enactedAt');
            });

            test('error on non-admin user', async () => {
                try {
                    await request({
                        headers: {
                            Authorization: managerUserToken,
                        },
                        method: 'POST',
                        uri: `${app.url}/license`,
                    });
                } catch (err) {
                    const res = err.response;
                    expect(res.statusCode).toBe(HTTP_STATUS.FORBIDDEN);
                    return;
                }
                throw new Error('Did not throw expected error');
            });
        });

        describe('POST /sign', () => {
            test('new sign ok', async () => {
                const before = timeStampNow();
                const res = await request({
                    headers: {
                        Authorization: unsignedUserToken,
                    },
                    method: 'POST',
                    uri: `${app.url}/license/sign`,
                });
                expect(res.statusCode).toBe(HTTP_STATUS.OK);
                expect(res.body).toHaveProperty('signedLicenseAt');
                expect(res.body.signedLicenseAt).toBeGreaterThan(before);
            });

            test('updates the timestamp when the user re-signs', async () => {
                const before = timeStampNow();
                const res = await request({
                    headers: {
                        Authorization: managerUserToken,
                    },
                    method: 'POST',
                    uri: `${app.url}/license/sign`,
                });
                expect(res.statusCode).toBe(HTTP_STATUS.OK);
                expect(res.body).toHaveProperty('signedLicenseAt');
                expect(res.body.signedLicenseAt).toBeGreaterThan(before);
            });
        });

        describe('middleware check access to data routes', () => {
            test('denies when the user has not signed', async () => {
                try {
                    await request({
                        body: {
                            limit: 1,
                            target: 'Vocabulary',
                        },
                        headers: {
                            Authorization: unsignedUserToken,
                        },
                        method: 'POST',
                        uri: `${app.url}/query`,
                    });
                } catch (err) {
                    const res = err.response;
                    expect(res.statusCode).toBe(HTTP_STATUS.FORBIDDEN);
                    return;
                }
                throw new Error('Did not throw expected error');
            });

            test('allows when the user has signed', async () => {
                const res = await request({
                    body: {
                        limit: 1,
                        target: 'Vocabulary',
                    },
                    headers: {
                        Authorization: managerUserToken,
                    },
                    method: 'POST',
                    uri: `${app.url}/query`,
                });
                expect(res.statusCode).toBe(HTTP_STATUS.OK);
            });
        });
    });
});
