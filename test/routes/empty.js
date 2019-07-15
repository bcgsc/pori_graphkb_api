

const requestPromise = require('request-promise');
const HTTP_STATUS = require('http-status-codes');

const {
    setUpEmptyDB, clearDB
} = require('./../util');
const {generateToken} = require('./../../app/routes/auth');

const REALLY_LONG_TIME = 10000000000;
const TEST_TIMEOUT_MS = 500 * 1000;
jest.setTimeout(TEST_TIMEOUT_MS);


const request = async opt => requestPromise({resolveWithFullResponse: true, json: true, ...opt});

/**
 * Mocks a set of 3 disease records related as aliases
 */
const mockRelatedDiseases = async ({app, mockToken, source}) => {
    const [res1, res2] = await Promise.all([
        request({
            uri: `${app.url}/diseases`,
            body: {
                sourceId: 'cancer',
                source
            },
            method: 'POST',
            headers: {
                Authorization: mockToken
            }
        }),
        request({
            uri: `${app.url}/diseases`,
            body: {
                sourceId: 'carcinoma',
                source
            },
            method: 'POST',
            headers: {
                Authorization: mockToken
            }
        })
    ]);
    const [, res3] = await Promise.all([
        request({
            uri: `${app.url}/aliasof`,
            body: {
                out: res1.body.result['@rid'],
                in: res2.body.result['@rid'],
                source
            },
            method: 'POST',
            headers: {
                Authorization: mockToken
            }
        }),
        request({
            uri: `${app.url}/diseases`,
            body: {
                sourceId: 'disease of cellular proliferation',
                source
            },
            method: 'POST',
            headers: {
                Authorization: mockToken
            }
        })
    ]);
    const res4 = await request({
        uri: `${app.url}/aliasof`,
        body: {
            out: res1.body.result['@rid'],
            in: res3.body.result['@rid'],
            source
        },
        method: 'POST',
        headers: {
            Authorization: mockToken
        }
    });
    await request({
        uri: `${app.url}/diseases/${res2.body.result['@rid'].slice(1)}`,
        method: 'DELETE',
        headers: {
            Authorization: mockToken
        }
    });
    await request({
        uri: `${app.url}/aliasof/${res4.body.result['@rid'].slice(1)}`,
        method: 'DELETE',
        headers: {
            Authorization: mockToken
        }
    });

    return [res1.body.result, res2.body.result, res3.body.result];
};

const describeWithAuth = process.env.GKB_DBS_PASS
    ? describe
    : describe.skip;

if (!process.env.GKB_DBS_PASS) {
    console.warn('Cannot run API tests without database password (GKB_DBS_PASS)');
}

describeWithAuth('API', () => {
    let db,
        admin,
        app,
        mockToken,
        server,
        conf,
        dbName;
    beforeAll(async () => {
        const {AppServer, createConfig} = require('./../../app'); // eslint-disable-line global-require
        ({
            db,
            admin,
            server,
            conf,
            dbName
        } = await setUpEmptyDB(createConfig({GKB_DISABLE_AUTH: true, GKB_PORT: null})));

        conf.GKB_DB_CREATE = false; // already created
        app = new AppServer(conf, false);

        await app.listen();
        mockToken = await generateToken(db, admin.name, conf.GKB_KEY, REALLY_LONG_TIME);
    });
    afterAll(async () => {
        if (server) {
            if (db && dbName) {
                await server.dropDatabase({name: dbName, username: conf.GKB_DBS_USER, password: conf.GKB_DBS_PASS});
            }
            // await server.close();
            await app.close();
        }
    });
    afterEach(async () => {
        // clear all V/E records
        await clearDB(db, admin);
    });

    describe('GET /stats', () => {
        test('gathers table stats', async () => {
            const res = await request({uri: `${app.url}/stats`, method: 'GET', headers: {Authorization: mockToken}});
            expect(res.statusCode).toBe(HTTP_STATUS.OK);
            expect(res.body).toHaveProperty('result');
            expect(res.body.result).toHaveProperty('User', 1);
            expect(res.body.result).not.toHaveProperty('ProteinPosition'); // ignore embedded
            expect(res.body.result).not.toHaveProperty('Variant'); // ignore abstract
        });
    });
    test('GET unprotected /version information', async () => {
        const res = await request({uri: `${app.url}/version`, method: 'GET'});
        expect(res.statusCode).toBe(HTTP_STATUS.OK);
        expect(res.body).toHaveProperty('api', expect.stringMatching(/^\d+\.\d+\.\d+$/));
        expect(res.body).toHaveProperty('db');
        expect(res.body).toHaveProperty('schema');
    });
    describe('database', () => {
        let source;
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
        });
        describe('GET /users', () => {
            test('name', async () => {
                const res = await request({uri: `${app.url}/users?name=${admin.name}`, method: 'GET', headers: {Authorization: mockToken}});
                expect(res.statusCode).toBe(HTTP_STATUS.OK);
                expect(Array.isArray(res.body.result)).toBe(true);
                expect(res.body.result.length).toBe(1);
                expect(res.body.result[0].name).toBe(admin.name);
            });
            test('aggregates the count', async () => {
                const res = await request({uri: `${app.url}/users?count=true`, method: 'GET', headers: {Authorization: mockToken}});
                expect(res.statusCode).toBe(HTTP_STATUS.OK);
                expect(res.body.result).toEqual([{count: 1}]);
            });
        });
        describe('POST /users/search', () => {
            test('name', async () => {
                const res = await request({
                    uri: `${app.url}/users/search`,
                    headers: {
                        Authorization: mockToken
                    },
                    method: 'POST',
                    body: {
                        where: [
                            {attr: 'name', value: admin.name}
                        ],
                        neighbors: 1,
                        limit: 10
                    }
                });
                expect(res.statusCode).toBe(HTTP_STATUS.OK);
                expect(Array.isArray(res.body.result)).toBe(true);
                expect(res.body.result.length).toBe(1);
                expect(res.body.result[0].name).toBe(admin.name);
            });
            test('BAD REQUEST for query params', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/users/search`,
                        qs: {neighbors: 1},
                        headers: {
                            Authorization: mockToken
                        },
                        method: 'POST',
                        body: {
                            where: [
                                {attr: 'name', value: admin.name}
                            ],
                            neighbors: 1,
                            limit: 10
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('name', 'ValidationError');
            });
        });
        describe('POST /users', () => {
            test('OK', async () => {
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
            test('BAD REQUEST', async () => {
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
            test('UNAUTHORIZED', async () => {
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
            test('CONFLICT', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/users`,
                        headers: {
                            Authorization: mockToken
                        },
                        method: 'POST',
                        body: {
                            name: admin.name
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.CONFLICT);
            });
        });
        describe('PATCH /users/{rid}', () => {
            let readyOnly,
                adminGroup,
                user;
            beforeEach(async () => {
                const res = await request({
                    uri: `${app.url}/usergroups`,
                    headers: {
                        Authorization: mockToken
                    },
                    method: 'GET'
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
                    method: 'POST',
                    body: {
                        name: 'alice',
                        groups: [readyOnly['@rid']]
                    },
                    headers: {Authorization: mockToken}
                })
                ).body.result;
            });
            test('modify the group associated with a user', async () => {
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
            test('rename the user', async () => {
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
        });
        describe('DELETE /users/{rid}', () => {
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
                expect(result.deletedBy).toBe(admin['@rid'].toString());
            });
        });
        test('POST /usergroups', async () => {
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
        describe('PATCH /usergroups/{rid}', () => {
            let group;
            beforeEach(async () => {
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
            test('modify permissions', async () => {
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
        });
        describe('GET /features', () => {
            test('BAD REQUEST on invalid biotype', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/features`,
                        headers: {
                            Authorization: mockToken
                        },
                        method: 'GET',
                        qs: {
                            biotype: 'blargh'
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('name', 'ValidationError');
            });
            test('BAD REQUEST on invalid special query param', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/features`,
                        headers: {
                            Authorization: mockToken
                        },
                        method: 'GET',
                        qs: {
                            neighbors: -1
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('name', 'ValidationError');
            });
            test('aggregates on count', async () => {
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
                expect(result).toEqual([{count: 0}]);
            });
        });
        describe('GET /features/{rid}', () => {
            test('BAD REQUEST on invalid rid', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/features/kme`,
                        headers: {
                            Authorization: mockToken
                        },
                        method: 'GET'
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('name', 'ValidationError');
            });
        });
        describe('POST /diseases', () => {
            test('OK', async () => {
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
            test('BAD REQUEST (no source given)', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/diseases`,
                        headers: {
                            Authorization: mockToken
                        },
                        method: 'POST',
                        body: {
                            sourceId: 'cancer'
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('name', 'ValidationError');
            });
            test('BAD REQUEST (no sourceId given)', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/diseases`,
                        headers: {
                            Authorization: mockToken
                        },
                        method: 'POST',
                        body: {
                            source
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('name', 'ValidationError');
            });
            test('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/diseases`,
                        method: 'POST',
                        body: {
                            sourceId: 'cancer',
                            source
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
            });
            test('CONFLICT', async () => {
                let res;
                res = await request({
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: 'cancer',
                        source
                    },
                    method: 'POST',
                    headers: {
                        Authorization: mockToken
                    }
                });
                expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
                try {
                    res = await request({
                        uri: `${app.url}/diseases`,
                        body: {
                            sourceId: 'cancer',
                            source
                        },
                        method: 'POST',
                        headers: {
                            Authorization: mockToken
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.CONFLICT);
            });
        });
        describe('PATCH /diseases', () => {
            let disease,
                diseaseId;
            beforeEach(async () => {
                const res = await request({
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: 'cancer',
                        source
                    },
                    method: 'POST',
                    headers: {
                        Authorization: mockToken
                    }
                });
                disease = res.body.result;
                diseaseId = disease['@rid'].replace('#', '');
            });
            test('OK', async () => {
                const res = await request({
                    uri: `${app.url}/diseases/${diseaseId}`,
                    body: {
                        sourceId: 'carcinoma'
                    },
                    method: 'PATCH',
                    headers: {Authorization: mockToken}
                });
                expect(res.statusCode).toBe(HTTP_STATUS.OK);
                expect(typeof res.body.result).toBe('object');
                expect(res.body.result).toHaveProperty('sourceId', 'carcinoma');
                expect(res.body.result).toHaveProperty('source', disease.source);
                expect(res.body.result).toHaveProperty('@rid', disease['@rid']);
                expect(res.body.result).toHaveProperty('history');
                expect(res.body.result.history).not.toBe(disease['@rid']);
            });
            test('NOT FOUND', async () => {
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
            test('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/diseases/${diseaseId}`,
                        method: 'PATCH',
                        body: {
                            sourceId: 'cancer',
                            source
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
            });
            test('CONFLICT', async () => {
                let res;
                res = await request({
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: 'carcinoma',
                        source
                    },
                    method: 'POST',
                    headers: {Authorization: mockToken}
                });
                expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
                try {
                    res = await request({
                        uri: `${app.url}/diseases/${diseaseId}`,
                        body: {
                            sourceId: 'carcinoma'
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
        describe('DELETE /diseases', () => {
            let disease,
                diseaseId;
            beforeEach(async () => {
                const {body: {result}} = await request({
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: 'cancer',
                        source
                    },
                    headers: {Authorization: mockToken},
                    method: 'POST'
                });
                disease = result;
                diseaseId = result['@rid'].replace('#', '');
            });
            test('OK', async () => {
                const res = await request({
                    uri: `${app.url}/diseases/${diseaseId}`,
                    method: 'DELETE',
                    headers: {Authorization: mockToken}
                });
                expect(res.statusCode).toBe(HTTP_STATUS.OK);
                expect(typeof res.body.result).toBe('object');
                expect(res.body.result).toHaveProperty('sourceId', disease.sourceId);
                expect(res.body.result).toHaveProperty('source', disease.source);
                expect(res.body.result).toHaveProperty('@rid', disease['@rid']);
                expect(res.body.result).toHaveProperty('deletedAt');
                expect(res.body.result.deletedAt).not.toBeNaN();
                expect(res.body.result).toHaveProperty('deletedBy', admin['@rid'].toString());
            });
            test('NOT FOUND', async () => {
                let res;
                try {
                    res = await request({uri: `${app.url}/diseases/456:0`, method: 'DELETE', headers: {Authorization: mockToken}});
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
                expect(res.body).toHaveProperty('name', 'NoRecordFoundError');
            });
            test('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await request({uri: `${app.url}/diseases/${diseaseId}`, method: 'DELETE'});
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
            });
        });
        // select neighbors that are not deleted
        describe('GET /<class> active and related records', () => {
            beforeEach(async () => {
                await mockRelatedDiseases({app, source, mockToken});
            });
            test('default limits to active records', async () => {
                const res = await request({
                    uri: `${app.url}/diseases`,
                    method: 'GET',
                    qs: {neighbors: 2},
                    headers: {Authorization: mockToken}
                });
                expect(res.body.result[0]).toHaveProperty('sourceId', 'cancer');
                expect(res.body.result[0]).toHaveProperty('out_AliasOf');
                expect(res.body.result[0].out_AliasOf).toEqual([]);
            });
            test('neighborhood query returns both', async () => {
                const res = await request({
                    uri: `${app.url}/diseases/search`,
                    method: 'POST',
                    body: {
                        type: 'neighborhood',
                        where: {attr: 'sourceId', value: 'cancer'},
                        neighbors: 2
                    },
                    headers: {Authorization: mockToken}
                });
                expect(res.body.result[0]).toHaveProperty('sourceId', 'cancer');
                expect(res.body.result[0]).toHaveProperty('out_AliasOf');
                expect(res.body.result[0].out_AliasOf).toEqual([]);
            });
            test('includes deleted when not limited to active', async () => {
                const res = await request({
                    uri: `${app.url}/diseases`,
                    method: 'GET',
                    qs: {neighbors: 2, activeOnly: false},
                    headers: {Authorization: mockToken}
                });
                expect(res.body.result).toHaveProperty('length', 6);
            });
        });
        describe('POST /<class>/search', () => {
            beforeEach(async () => {
                await mockRelatedDiseases({app, source, mockToken});
            });
            test('default all', async () => {
                const res = await request({
                    uri: `${app.url}/diseases/search`,
                    method: 'POST',
                    body: {},
                    headers: {Authorization: mockToken}
                });
                expect(res.body.result).toHaveProperty('length', 3);
            });
            test('apply skip', async () => {
                const res = await request({
                    uri: `${app.url}/diseases/search`,
                    method: 'POST',
                    body: {skip: 1},
                    headers: {Authorization: mockToken}
                });
                expect(res.body.result).toHaveProperty('length', 2);
            });
            test('apply limit', async () => {
                const res = await request({
                    uri: `${app.url}/diseases/search`,
                    method: 'POST',
                    body: {limit: 1},
                    headers: {Authorization: mockToken}
                });
                expect(res.body.result).toHaveProperty('length', 1);
            });
            test('retrieve deleted records', async () => {
                const res = await request({
                    uri: `${app.url}/diseases/search`,
                    method: 'POST',
                    body: {activeOnly: false},
                    headers: {Authorization: mockToken}
                });
                expect(res.body.result).toHaveProperty('length', 3);
            });
            test.todo('throw error on neighbors');
            test.todo('allow ordering');
        });
        describe('GET /records Records by ID list', () => {
            let record1,
                record2,
                deletedRecord;
            beforeEach(async () => {
                const result = await mockRelatedDiseases({app, source, mockToken});
                ([record1, deletedRecord, record2] = result.map(rec => rec['@rid'].slice(1)));
            });
            test('ok for 2 existing records', async () => {
                const res = await request({
                    uri: `${app.url}/records`,
                    method: 'GET',
                    qs: {rid: `${record1},${record2}`},
                    headers: {Authorization: mockToken}
                });
                expect(res.body.result).toHaveProperty('length', 2);
            });
            test('fails for properly formatted non-existant cluster RID', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/records`,
                        method: 'GET',
                        qs: {rid: `${record1},1111:1111`},
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('expected 2 records but only found 1');
            });
            test('errors on missing non-existant RID on a valid cluster', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/records`,
                        method: 'GET',
                        qs: {rid: `${record1},1:1111`},
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('expected 2 records but only found 1');
            });
            test('error on bad neighbors argument', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/records`,
                        method: 'GET',
                        qs: {
                            rid: `${record1}`,
                            neighbors: 'k'
                        },
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('k is not a valid integer');
            });
            test('error on unrecognized argument', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/records`,
                        method: 'GET',
                        qs: {
                            rid: `${record1}`,
                            limit: 100
                        },
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('Invalid query parameter(s) (limit)');
            });
            test('error on malformed RID', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/records`,
                        method: 'GET',
                        qs: {
                            rid: `${record1},7`
                        },
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('not a valid RID');
            });
            test('errors on deleted records', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/records`,
                        method: 'GET',
                        qs: {rid: `${record1},${record2},${deletedRecord}`},
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('expected 3 records but only found 2');
            });
            test('includes deleted records when activeOnly off', async () => {
                const res = await request({
                    uri: `${app.url}/records`,
                    method: 'GET',
                    qs: {
                        rid: `${record1},${record2},${deletedRecord}`,
                        activeOnly: false
                    },
                    headers: {Authorization: mockToken}
                });
                expect(res.body.result).toHaveProperty('length', 3);
            });
        });
        describe('GET /ontologies', () => {
            beforeEach(async () => {
                await request({
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: '2',
                        name: 'liver cancer',
                        source,
                        subsets: ['A', 'B', 'C', 'd']
                    },
                    headers: {Authorization: mockToken},
                    method: 'POST'
                });
            });
            test('Does not throw permissions error', async () => {
                const resp = await request({uri: `${app.url}/ontologies`, method: 'GET', headers: {Authorization: mockToken}});
                expect(resp.body).toHaveProperty('result');
                expect(resp.body.result).toHaveProperty('length', 1);
            });
            test('query by subset single term', async () => {
                const resp = await request({
                    uri: `${app.url}/ontologies`,
                    method: 'GET',
                    qs: {subsets: 'a'},
                    headers: {Authorization: mockToken}
                });
                expect(resp.body).toHaveProperty('result');
                expect(resp.body.result).toHaveProperty('length', 1);
            });
        });
        describe('Query FULLTEXT index', () => {
            beforeEach(async () => {
                await request({
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: '2',
                        name: 'liver cancer',
                        source
                    },
                    method: 'POST',
                    headers: {Authorization: mockToken}
                });
                await request({
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: '3',
                        name: 'breast cancer',
                        source
                    },
                    method: 'POST',
                    headers: {Authorization: mockToken}
                });
                await request({
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: '1',
                        name: 'liver angiosarcoma',
                        source
                    },
                    method: 'POST',
                    headers: {Authorization: mockToken}
                });
            });
            test('requires all terms', async () => {
                const res = await request({
                    uri: `${app.url}/diseases`,
                    method: 'GET',
                    qs: {name: '~liver cancer'},
                    headers: {Authorization: mockToken}
                });
                expect(res.statusCode).toBe(HTTP_STATUS.OK);
                expect(res.body.result).toHaveProperty('length', 1);

                expect(res.body.result[0]).toHaveProperty('name', 'liver cancer');
            });
            test('ignores case (due to cast)', async () => {
                const res = await request({
                    uri: `${app.url}/diseases`,
                    method: 'GET',
                    qs: {name: '~CAncer'},
                    headers: {Authorization: mockToken}
                });
                expect(res.statusCode).toBe(HTTP_STATUS.OK);
                expect(res.body.result).toHaveProperty('length', 2);
            });
        });

        describe('GET /api/search?keyword', () => {
            let liverCancer,
                breastCancer,
                liverAngiosarc,
                publication,
                vocab,
                feature;
            beforeEach(async () => {
                liverCancer = (await request({
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: '2',
                        name: 'liver cancer',
                        source
                    },
                    headers: {Authorization: mockToken},
                    method: 'POST'
                })).body.result['@rid'];
                breastCancer = (await request({
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: '3',
                        name: 'breast cancer',
                        source
                    },
                    headers: {Authorization: mockToken},
                    method: 'POST'
                })).body.result['@rid'];
                liverAngiosarc = (await request({
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: '1',
                        name: 'liver angiosarcoma',
                        source
                    },
                    headers: {Authorization: mockToken},
                    method: 'POST'
                })).body.result['@rid'];
                publication = (await request({
                    uri: `${app.url}/publications`,
                    body: {
                        sourceId: 'article',
                        name: 'article',
                        source
                    },
                    headers: {Authorization: mockToken},
                    method: 'POST'
                })).body.result['@rid'];
                vocab = (await request({
                    uri: `${app.url}/vocabulary`,
                    body: {
                        sourceId: 'vocab',
                        name: 'vocab',
                        source
                    },
                    headers: {Authorization: mockToken},
                    method: 'POST'
                })).body.result['@rid'];
                feature = (await request({
                    uri: `${app.url}/features`,
                    body: {
                        sourceId: 'gene',
                        name: 'gene',
                        source,
                        biotype: 'gene'
                    },
                    headers: {Authorization: mockToken},
                    method: 'POST'
                })).body.result['@rid'];
                // now create the statements
                await request({
                    uri: `${app.url}/statements`,
                    method: 'POST',
                    body: {
                        appliesTo: feature,
                        relevance: vocab,
                        impliedBy: [liverAngiosarc],
                        supportedBy: [publication]
                    },
                    headers: {Authorization: mockToken}
                });
                await request({
                    uri: `${app.url}/statements`,
                    method: 'POST',
                    body: {
                        appliesTo: feature,
                        relevance: vocab,
                        impliedBy: [liverAngiosarc, liverCancer],
                        supportedBy: [publication]
                    },
                    headers: {Authorization: mockToken}
                });
                await request({
                    uri: `${app.url}/statements`,
                    method: 'POST',
                    body: {
                        appliesTo: breastCancer,
                        relevance: vocab,
                        impliedBy: [liverAngiosarc],
                        supportedBy: [publication]
                    },
                    headers: {Authorization: mockToken}
                });
            });
            test('retrieves by appliesTo', async () => {
                const res = await request({
                    uri: `${app.url}/search`,
                    method: 'GET',
                    qs: {keyword: 'breast cancer', limit: 10, neighbors: 0},
                    headers: {Authorization: mockToken}
                });
                expect(res.body.result).toHaveProperty('length', 1);
            });
            test('retrieves by impliedBy', async () => {
                const res = await request({
                    uri: `${app.url}/search`,
                    method: 'GET',
                    qs: {keyword: 'liver cancer', limit: 10, neighbors: 0},
                    headers: {Authorization: mockToken}
                });
                expect(res.body.result).toHaveProperty('length', 1);
            });
            test('Ignores supportedBy', async () => {
                const res = await request({
                    uri: `${app.url}/search`,
                    method: 'GET',
                    qs: {keyword: 'article', limit: 10, neighbors: 0},
                    headers: {Authorization: mockToken}
                });
                expect(res.body.result).toHaveProperty('length', 0);
            });
            test('retrieves by relevance', async () => {
                const res = await request({
                    uri: `${app.url}/search`,
                    method: 'GET',
                    qs: {keyword: 'vocab', limit: 10, neighbors: 0},
                    headers: {Authorization: mockToken}
                });
                expect(res.body.result).toHaveProperty('length', 3);
            });
            test('retrieves by either', async () => {
                const res = await request({
                    uri: `${app.url}/search`,
                    method: 'GET',
                    qs: {keyword: 'cancer'},
                    headers: {Authorization: mockToken}
                });
                expect(res.statusCode).toBe(HTTP_STATUS.OK);
                expect(res.body.result).toHaveProperty('length', 2);
            });
            test('with skip', async () => {
                const res = await request({
                    uri: `${app.url}/search`,
                    method: 'GET',
                    qs: {keyword: 'cancer', skip: 1},
                    headers: {Authorization: mockToken}
                });
                expect(res.statusCode).toBe(HTTP_STATUS.OK);
                expect(res.body.result).toHaveProperty('length', 1);
            });
        });
        describe('POST /statement', () => {
            let disease1,
                disease2,
                publication1,
                relevance1;
            beforeEach(async () => {
                [
                    disease1,
                    disease2,
                    publication1,,
                    relevance1

                ] = await Promise.all(Array.from([
                    {content: {name: 'disease1', sourceId: 'disease1'}, route: 'diseases'},
                    {content: {name: 'disease2', sourceId: 'disease2'}, route: 'diseases'},
                    {content: {name: 'publication1', sourceId: 'publication1'}, route: 'publications'},
                    {content: {name: 'publication2', sourceId: 'publication2'}, route: 'publications'},
                    {content: {name: 'relevance1', sourceId: 'relevance1'}, route: 'vocabulary'},
                    {content: {name: 'relevance2', sourceId: 'relevance2'}, route: 'vocabulary'}
                ], async (opt) => {
                    const res = await request({
                        uri: `${app.url}/${opt.route}`,
                        method: 'POST',
                        body: Object.assign({source}, opt.content),
                        headers: {Authorization: mockToken}
                    });
                    return res.body.result;
                }));
            });
            test('BAD REQUEST error on supportedBy undefined', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: disease1['@rid'],
                            impliedBy: [{target: disease1['@rid']}],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('must include an array property supportedBy');
            });
            test('BAD REQUEST error on supportedBy empty array', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: disease1['@rid'],
                            supportedBy: [],
                            impliedBy: [{target: disease1['@rid']}],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('must include an array property supportedBy');
            });
            test('BAD REQUEST error on supportedBy bad RID format', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: disease1['@rid'],
                            supportedBy: [{target: 'not an rid'}],
                            impliedBy: [{target: disease1['@rid']}],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('does not look like a valid RID');
            });
            test('BAD REQUEST error on impliedBy undefined', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: disease1['@rid'],
                            supportedBy: [{target: publication1['@rid']}],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('must include an array property impliedBy');
            });
            test('BAD REQUEST error on impliedBy empty array', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: disease1['@rid'],
                            impliedBy: [],
                            supportedBy: [{target: publication1['@rid']}],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('must include an array property impliedBy');
            });
            test('BAD REQUEST error on impliedBy bad RID format', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: disease1['@rid'],
                            impliedBy: [{target: 'not an rid'}],
                            supportedBy: [{target: publication1['@rid']}],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('does not look like a valid RID');
            });
            test('BAD REQUEST error in finding one of the dependencies', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: '#448989898:0',
                            impliedBy: [disease1],
                            supportedBy: [publication1],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('error in retrieving one or more of the dependencies');
            });
            test('BAD REQUEST error on missing relevance', async () => {
                let res;
                try {
                    const opt = {
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: disease1,
                            impliedBy: [disease1],
                            supportedBy: [publication1]
                        },
                        headers: {Authorization: mockToken}
                    };
                    res = await request(opt);
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('must have the relevance property');
            });
            test('BAD REQUEST error on missing appliesTo', async () => {
                let res;
                try {
                    res = await request({
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            impliedBy: [disease1],
                            supportedBy: [publication1],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).toHaveProperty('message');
                expect(res.body.message).toContain('must have the appliesTo property');
            });
            test('creates statement', async () => {
                const res = await request({
                    uri: `${app.url}/statements`,
                    method: 'POST',
                    body: {
                        appliesTo: disease1,
                        impliedBy: [disease2],
                        supportedBy: [publication1],
                        relevance: relevance1
                    },
                    headers: {Authorization: mockToken}
                });
                expect(res.statusCode).toBe(HTTP_STATUS.CREATED);
            });
        });
        describe('CREATE PositionalVariant', () => {
            let type,
                reference1;
            beforeEach(async () => {
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
            test('create a amino acid substitution', async () => {
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
    });
});
