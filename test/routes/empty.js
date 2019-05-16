

const {
    expect
} = require('chai');
const request = require('request-promise');
const HTTP_STATUS = require('http-status-codes');

const {
    setUpEmptyDB, clearDB
} = require('./../util');
const {generateToken} = require('./../../app/routes/auth');

const REALLY_LONG_TIME = 10000000000;
const TEST_TIMEOUT_MS = 50000;
jest.setTimeout(TEST_TIMEOUT_MS);

const DEFAULT_HEADERS = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
};

/**
 * Mocks a set of 3 disease records related as aliases
 */
const mockRelatedDiseases = async ({app, mockToken, source}) => {
    const res1 = await request({
        json: true,
        uri: `${app.url}/diseases`,
        body: {
            sourceId: 'cancer',
            source
        },
        method: 'POST',
        headers: {
            Authorization: mockToken,
            ...DEFAULT_HEADERS
        }
    });
    const res2 = await request({
        json: true,
        uri: `${app.url}/diseases`,
        body: {
            sourceId: 'carcinoma',
            source
        },
        headers: {
            Authorization: mockToken,
            ...DEFAULT_HEADERS
        }
    });
    await request({
        json: true,
        uri: `${app.url}/aliasof`,
        body: {
            out: res1.body.result['@rid'],
            in: res2.body.result['@rid'],
            source
        },
        method: 'POST',
        headers: {
            Authorization: mockToken,
            ...DEFAULT_HEADERS
        }
    });
    const res3 = await request({
        json: true,
        uri: `${app.url}/diseases`,
        body: {
            sourceId: 'disease of cellular proliferation',
            source
        },
        method: 'POST',
        headers: {
            Authorization: mockToken,
            ...DEFAULT_HEADERS
        }
    });
    const res4 = await request({
        json: true,
        uri: `${app.url}/aliasof`,
        body: {
            out: res1.body.result['@rid'],
            in: res3.body.result['@rid'],
            source
        },
        method: 'POST',
        headers: {
            Authorization: mockToken,
            ...DEFAULT_HEADERS
        }
    });
    await request({
        json: true,
        uri: `${app.url}/diseases/${res2.body.result['@rid'].slice(1)}`,
        method: 'DELETE',
        headers: {
            Authorization: mockToken,
            ...DEFAULT_HEADERS
        }
    });
    await request({
        json: true,
        uri: `${app.url}/diseases/${res4.body.result['@rid'].slice(1)}`,
        method: 'DELETE',
        headers: {
            Authorization: mockToken,
            ...DEFAULT_HEADERS
        }
    });

    return [res1.body.result, res2.body.result, res3.body.result];
};


describe('API', () => {
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
        console.log(app.url);
        mockToken = await generateToken(db, admin.name, conf.GKB_KEY, REALLY_LONG_TIME);
    });
    afterAll(async () => {
        if (server) {
            if (db && dbName) {
                await server.drop({name: dbName});
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
            const res = await request({
                json: true, uri: `${app.url}/stats`, method: 'GET', headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
            });
            expect(res.status).to.equal(HTTP_STATUS.OK);
            expect(res.body).to.have.property('result');
            expect(res.body.result).to.have.property('User', 1);
            expect(res.body.result).to.not.have.property('ProteinPosition'); // ignore embedded
            expect(res.body.result).to.not.have.property('Variant'); // ignore abstract
        });
    });
    describe('database', () => {
        let source;
        beforeEach(async () => {
            console.log('mockToken', mockToken);
            const res = await request({
                json: true,
                uri: `${app.url}/sources`,
                method: 'POST',
                body: {
                    name: 'bcgsc',
                    version: '2018'
                }
            });
            source = res.body.result;
        });
        describe('GET /users', () => {
            test('name', async () => {
                const res = await request({
                    json: true, uri: `${app.url}/users?name=${admin.name}`, method: 'GET', headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.status).to.equal(HTTP_STATUS.OK);
                expect(res.body.result).to.be.a('array');
                expect(res.body.result.length).to.equal(1);
                expect(res.body.result[0].name).to.equal(admin.name);
            });
            test('aggregates the count', async () => {
                const res = await request({
                    json: true, uri: `${app.url}/users?count=true`, method: 'GET', headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.status).to.equal(HTTP_STATUS.OK);
                expect(res.body.result).to.eql([{count: 1}]);
            });
        });
        describe('POST /users/search', () => {
            test('name', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/users/search`,
                    headers: {
                        Authorization: mockToken,
                        ...DEFAULT_HEADERS
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
                expect(res.status).to.equal(HTTP_STATUS.OK);
                expect(res.body.result).to.be.a('array');
                expect(res.body.result.length).to.equal(1);
                expect(res.body.result[0].name).to.equal(admin.name);
            });
            test('BAD REQUEST for query params', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/users/search`,
                        qs: {neighbors: 1},
                        headers: {
                            Authorization: mockToken,
                            ...DEFAULT_HEADERS
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
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('name', 'ValidationError');
            });
        });
        describe('POST /users', () => {
            test('OK', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/users`,
                    body: {
                        name: 'blargh monkeys'
                    },
                    method: 'POST',
                    headers: {
                        Authorization: mockToken,
                        ...DEFAULT_HEADERS
                    }
                });
                expect(res.status).to.equal(HTTP_STATUS.CREATED);
                expect(res.body.result).to.be.a('object');
                expect(res.body.result.name).to.equal('blargh monkeys');
            });
            test('BAD REQUEST', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/users`,
                        body: {
                        },
                        method: 'POST',
                        headers: {
                            Authorization: mockToken,
                            ...DEFAULT_HEADERS
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('name', 'ValidationError');
            });
            test('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/users`,
                        body: {
                            name: 'blargh monkeys'
                        },
                        method: 'POST',
                        headers: {
                            ...DEFAULT_HEADERS
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.UNAUTHORIZED);
            });
            test('CONFLICT', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/users`,
                        headers: {
                            Authorization: mockToken,
                            ...DEFAULT_HEADERS
                        },
                        method: 'POST',
                        body: {
                            name: admin.name
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.CONFLICT);
            });
        });
        describe('PATCH /users/{rid}', () => {
            let readyOnly,
                adminGroup,
                user;
            beforeEach(async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/usergroups`,
                    headers: {
                        Authorization: mockToken,
                        ...DEFAULT_HEADERS
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
                    json: true,
                    uri: `${app.url}/users`,
                    method: 'POST',
                    body: {
                        name: 'alice',
                        groups: [readyOnly['@rid']]
                    }
                })
                ).body.result;
            });
            test('modify the group associated with a user', async () => {
                const {body: {result}} = await request({
                    json: true,
                    uri: `${app.url}/users/${user['@rid'].slice(1)}`,
                    headers: {
                        Authorization: mockToken,
                        ...DEFAULT_HEADERS
                    },
                    body: {groups: [adminGroup['@rid']]},
                    method: 'PATCH'
                });
                expect(result).to.have.property('groups');
                expect(result.groups).to.have.property('length', 1);
                expect(result.groups[0]).to.equal(adminGroup['@rid']);
                expect(result).to.have.property('name', 'alice');
            });
            test('rename the user', async () => {
                const {body: {result}} = await request({
                    json: true,
                    uri: `${app.url}/users/${user['@rid'].slice(1)}`,
                    headers: {
                        Authorization: mockToken,
                        ...DEFAULT_HEADERS
                    },
                    body: {name: 'bob'},
                    method: 'PATCH'
                });
                expect(result).to.have.property('groups');
                expect(result.groups).to.have.property('length', 1);
                expect(result.groups[0]).to.equal(readyOnly['@rid']);
                expect(result).to.have.property('name', 'bob');
            });
        });
        describe('DELETE /users/{rid}', () => {
            let readyOnly,
                adminGroup,
                user;
            beforeEach(async () => {
                console.log(`${app.url}/usergroups`);
                const res = await request({
                    json: true,
                    uri: `${app.url}/usergroups`,
                    headers: {
                        Authorization: mockToken,
                        ...DEFAULT_HEADERS
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
                    json: true,
                    uri: `${app.url}/users`,
                    body: {
                        name: 'alice',
                        groups: [readyOnly['@rid']]
                    },
                    method: 'POST',
                    headers: {
                        Authorization: mockToken,
                        ...DEFAULT_HEADERS
                    }
                })).body.result;
            });
            test('delete the current user', async () => {
                const {body: {result}} = await request({
                    json: true,
                    uri: `${app.url}/users/${user['@rid'].slice(1)}`,
                    headers: {
                        Authorization: mockToken,
                        ...DEFAULT_HEADERS
                    },
                    method: 'DELETE'
                });
                expect(result).to.have.property('deletedAt');
                expect(result.deletedBy).to.equal(admin['@rid'].toString());
            });
        });
        test('POST /usergroups', async () => {
            const {body: {result}} = await request({
                json: true,
                uri: `${app.url}/usergroups`,
                headers: {
                    Authorization: mockToken,
                    ...DEFAULT_HEADERS
                },
                method: 'POST',
                body: {
                    name: 'wonderland',
                    permissions: {V: 15}
                }
            });
            expect(result).to.have.property('createdAt');
            expect(result).to.have.property('@class', 'UserGroup');
            expect(result.permissions).to.have.property('@class', 'Permissions');
        });
        describe('PATCH /usergroups/{rid}', () => {
            let group;
            beforeEach(async () => {
                const {body: {result}} = await request({
                    json: true,
                    uri: `${app.url}/usergroups`,
                    headers: {
                        Authorization: mockToken,
                        ...DEFAULT_HEADERS
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
                    json: true,
                    uri: `${app.url}/usergroups/${group['@rid'].toString().slice(1)}`,
                    headers: {
                        Authorization: mockToken,
                        ...DEFAULT_HEADERS
                    },
                    method: 'PATCH',
                    body: {
                        permissions: {V: 15, E: 15}
                    }
                });
                expect(result).to.have.property('@rid', group['@rid'].toString());
                expect(result).to.have.property('history');
            });
        });
        describe('GET /features', () => {
            test('BAD REQUEST on invalid biotype', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/features`,
                        headers: {
                            Authorization: mockToken,
                            ...DEFAULT_HEADERS
                        },
                        method: 'GET',
                        qs: {
                            biotype: 'blargh'
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('name', 'ValidationError');
            });
            test('BAD REQUEST on invalid special query param', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/features`,
                        headers: {
                            Authorization: mockToken,
                            ...DEFAULT_HEADERS
                        },
                        method: 'GET',
                        qs: {
                            neighbors: -1
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('name', 'ValidationError');
            });
            test('aggregates on count', async () => {
                const {body: {result}} = await request({
                    json: true,
                    uri: `${app.url}/features`,
                    headers: {
                        Authorization: mockToken,
                        ...DEFAULT_HEADERS
                    },
                    method: 'GET',
                    qs: {
                        count: 't'
                    }
                });
                expect(result).to.eql([{count: 0}]);
            });
        });
        describe('GET /features/{rid}', () => {
            test('BAD REQUEST on invalid rid', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/features/kme`,
                        headers: {
                            Authorization: mockToken,
                            ...DEFAULT_HEADERS
                        },
                        method: 'GET'
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('name', 'ValidationError');
            });
        });
        describe('POST /diseases', () => {
            test('OK', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    headers: {
                        Authorization: mockToken,
                        ...DEFAULT_HEADERS
                    },
                    method: 'POST',
                    body: {
                        sourceId: 'cancer',
                        source
                    }
                });
                expect(res.status).to.equal(HTTP_STATUS.CREATED);
                expect(res.body.result).to.be.a('object');
                expect(res.body.result).to.have.property('sourceId', 'cancer');
                expect(res.body.result.source).to.eql(source['@rid']);
            });
            test('BAD REQUEST (no source given)', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/diseases`,
                        headers: {
                            Authorization: mockToken,
                            ...DEFAULT_HEADERS
                        },
                        method: 'POST',
                        body: {
                            sourceId: 'cancer'
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('name', 'ValidationError');
            });
            test('BAD REQUEST (no sourceId given)', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/diseases`,
                        headers: {
                            Authorization: mockToken,
                            ...DEFAULT_HEADERS
                        },
                        method: 'POST',
                        body: {
                            source
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('name', 'ValidationError');
            });
            test('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/diseases`,
                        headers: {
                            ...DEFAULT_HEADERS
                        },
                        method: 'POST',
                        body: {
                            sourceId: 'cancer',
                            source
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.UNAUTHORIZED);
            });
            test('CONFLICT', async () => {
                let res;
                res = await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: 'cancer',
                        source
                    },
                    method: 'POST',
                    headers: {
                        Authorization: mockToken,
                        ...DEFAULT_HEADERS
                    }
                });
                expect(res.status).to.equal(HTTP_STATUS.CREATED);
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/diseases`,
                        body: {
                            sourceId: 'cancer',
                            source
                        },
                        method: 'POST',
                        headers: {
                            Authorization: mockToken,
                            ...DEFAULT_HEADERS
                        }
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.CONFLICT);
            });
        });
        describe('PATCH /diseases', () => {
            let disease,
                diseaseId;
            beforeEach(async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: 'cancer',
                        source
                    },
                    method: 'POST',
                    headers: {
                        Authorization: mockToken,
                        ...DEFAULT_HEADERS
                    }
                });
                disease = res.body.result;
                diseaseId = disease['@rid'].replace('#', '');
            });
            test('OK', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/diseases/${diseaseId}`,
                    body: {
                        sourceId: 'carcinoma'
                    },
                    method: 'PATCH',
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.status).to.equal(HTTP_STATUS.OK);
                expect(res.body.result).to.be.a('object');
                expect(res.body.result).to.have.property('sourceId', 'carcinoma');
                expect(res.body.result).to.have.property('source', disease.source);
                expect(res.body.result).to.have.property('@rid', disease['@rid']);
                expect(res.body.result).to.have.property('history');
                expect(res.body.result.history).to.not.equal(disease['@rid']);
            });
            test('NOT FOUND', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/diseases/456:0`,
                        body: {
                            sourceId: 'cancer'
                        },
                        method: 'PATCH',
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.NOT_FOUND);
                expect(res.body).to.have.property('name', 'NoRecordFoundError');
            });
            test('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/diseases/${diseaseId}`,
                        method: 'PATCH',
                        body: {
                            sourceId: 'cancer',
                            source
                        },
                        headers: {...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.UNAUTHORIZED);
            });
            test('CONFLICT', async () => {
                let res;
                res = await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: 'carcinoma',
                        source
                    }
                });
                expect(res.status).to.equal(HTTP_STATUS.CREATED);
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/diseases/${diseaseId}`,
                        body: {
                            sourceId: 'carcinoma'
                        },
                        method: 'PATCH',
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.CONFLICT);
            });
        });
        describe('DELETE /diseases', () => {
            let disease,
                diseaseId;
            beforeEach(async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: 'cancer',
                        source
                    }
                });
                disease = res.body.result;
                diseaseId = res.body.result['@rid'].replace('#', '');
            });
            test('OK', async () => {
                const res = await request({
                    json: true, uri: `${app.url}/diseases/${diseaseId}`, method: 'DELETE', headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.status).to.equal(HTTP_STATUS.OK);
                expect(res.body.result).to.be.a('object');
                expect(res.body.result).to.have.property('sourceId', disease.sourceId);
                expect(res.body.result).to.have.property('source', disease.source);
                expect(res.body.result).to.have.property('@rid', disease['@rid']);
                expect(res.body.result).to.have.property('deletedAt');
                expect(res.body.result.deletedAt).to.be.a.number;
                expect(res.body.result).to.have.property('deletedBy', admin['@rid'].toString());
            });
            test('NOT FOUND', async () => {
                let res;
                try {
                    res = await request({
                        json: true, uri: `${app.url}/diseases/456:0`, method: 'DELETE', headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.NOT_FOUND);
                expect(res.body).to.have.property('name', 'NoRecordFoundError');
            });
            test('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await request({
                        json: true, uri: `${app.url}/diseases/${diseaseId}`, method: 'DELETE', headers: {...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.UNAUTHORIZED);
            });
        });
        // select neighbors that are not deleted
        describe('GET /<class> active and related records', () => {
            beforeEach(async () => {
                await mockRelatedDiseases({app, source, mockToken});
            });
            test('default limits to active records', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    method: 'GET',
                    qs: {neighbors: 2},
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.body.result[0]).to.have.property('sourceId', 'cancer');
                expect(res.body.result[0]).to.have.property('out_AliasOf');
                expect(res.body.result[0].out_AliasOf).to.eql([]);
            });
            test('neighborhood query returns both', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/diseases/search`,
                    method: 'POST',
                    body: {
                        type: 'neighborhood',
                        where: {attr: 'sourceId', value: 'cancer'},
                        neighbors: 2
                    },
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.body.result[0]).to.have.property('sourceId', 'cancer');
                expect(res.body.result[0]).to.have.property('out_AliasOf');
                expect(res.body.result[0].out_AliasOf).to.eql([]);
            });
            test('includes deleted when not limited to active', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    method: 'GET',
                    qs: {neighbors: 2, activeOnly: false},
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.body.result).to.have.property('length', 6);
            });
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
                    json: true,
                    uri: `${app.url}/records`,
                    method: 'GET',
                    qs: {rid: `${record1},${record2}`},
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.body.result).to.have.property('length', 2);
            });
            test('fails for properly formatted non-existant cluster RID', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/records`,
                        method: 'GET',
                        qs: {rid: `${record1},1111:1111`},
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.NOT_FOUND);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('One or more invalid record cluster IDs (<cluster>:#)');
            });
            test('Ignores non-existant RID on a valid cluster', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/records`,
                    method: 'GET',
                    qs: {rid: `${record1},1:1111`},
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.body.result).to.have.property('length', 1);
            });
            test('error on bad neighbors argument', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/records`,
                        method: 'GET',
                        qs: {
                            rid: `${record1}`,
                            neighbors: 'k'
                        },
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('k is not a valid decimal integer');
            });
            test('error on unrecognized argument', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/records`,
                        method: 'GET',
                        qs: {
                            rid: `${record1}`,
                            limit: 100
                        },
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('Invalid query parameter(s) (limit)');
            });
            test('error on malformed RID', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/records`,
                        method: 'GET',
                        qs: {
                            rid: `${record1},7`
                        },
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('not a valid RID');
            });
            test('ignores deleted records', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/records`,
                    method: 'GET',
                    qs: {rid: `${record1},${record2},${deletedRecord}`},
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.body.result).to.have.property('length', 2);
            });
            test('includes deleted records when activeOnly off', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/records`,
                    method: 'GET',
                    qs: {
                        rid: `${record1},${record2},${deletedRecord}`,
                        activeOnly: false
                    },
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.body.result).to.have.property('length', 3);
            });
        });
        describe('GET /ontologies', () => {
            beforeEach(async () => {
                await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: '2',
                        name: 'liver cancer',
                        source,
                        subsets: ['A', 'B', 'C', 'd']
                    }
                });
            });
            test('Does not throw permissions error', async () => {
                const resp = await request({
                    json: true, uri: `${app.url}/ontologies`, method: 'GET', headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(resp.body).to.have.property('result');
                expect(resp.body.result).to.have.property('length', 1);
            });
            test('query by subset single term', async () => {
                const resp = await request({
                    json: true,
                    uri: `${app.url}/ontologies`,
                    method: 'GET',
                    qs: {subsets: 'a'},
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(resp.body).to.have.property('result');
                expect(resp.body.result).to.have.property('length', 1);
            });
        });
        describe('Query FULLTEXT index', () => {
            beforeEach(async () => {
                await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: '2',
                        name: 'liver cancer',
                        source
                    }
                });
                await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: '3',
                        name: 'breast cancer',
                        source
                    }
                });
                await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: '1',
                        name: 'liver angiosarcoma',
                        source
                    }
                });
            });
            test('requires all terms', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    method: 'GET',
                    qs: {name: '~liver cancer'},
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.status).to.equal(HTTP_STATUS.OK);
                expect(res.body.result).to.have.property('length', 1);

                expect(res.body.result[0]).to.have.property('name', 'liver cancer');
            });
            test('ignores case (due to cast)', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    method: 'GET',
                    qs: {name: '~CAncer'},
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.status).to.equal(HTTP_STATUS.OK);
                expect(res.body.result).to.have.property('length', 2);
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
                    json: true,
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: '2',
                        name: 'liver cancer',
                        source
                    }
                })).body.result['@rid'];
                breastCancer = (await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: '3',
                        name: 'breast cancer',
                        source
                    }
                })).body.result['@rid'];
                liverAngiosarc = (await request({
                    json: true,
                    uri: `${app.url}/diseases`,
                    body: {
                        sourceId: '1',
                        name: 'liver angiosarcoma',
                        source
                    }
                })).body.result['@rid'];
                publication = (await request({
                    json: true,
                    uri: `${app.url}/publications`,
                    body: {
                        sourceId: 'article',
                        name: 'article',
                        source
                    }
                })).body.result['@rid'];
                vocab = (await request({
                    json: true,
                    uri: `${app.url}/vocabulary`,
                    body: {
                        sourceId: 'vocab',
                        name: 'vocab',
                        source
                    }
                })).body.result['@rid'];
                feature = (await request({
                    json: true,
                    uri: `${app.url}/features`,
                    body: {
                        sourceId: 'gene',
                        name: 'gene',
                        source,
                        biotype: 'gene'
                    }
                })).body.result['@rid'];
                // now create the statements
                await request({
                    json: true,
                    uri: `${app.url}/statements`,
                    method: 'POST',
                    body: {
                        appliesTo: feature,
                        relevance: vocab,
                        impliedBy: [{target: liverAngiosarc}],
                        supportedBy: [{target: publication}]
                    },
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                await request({
                    json: true,
                    uri: `${app.url}/statements`,
                    method: 'POST',
                    body: {
                        appliesTo: feature,
                        relevance: vocab,
                        impliedBy: [{target: liverAngiosarc}, {target: liverCancer}],
                        supportedBy: [{target: publication}]
                    },
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                await request({
                    json: true,
                    uri: `${app.url}/statements`,
                    method: 'POST',
                    body: {
                        appliesTo: breastCancer,
                        relevance: vocab,
                        impliedBy: [{target: liverAngiosarc}],
                        supportedBy: [{target: publication}]
                    },
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
            });
            test('retrieves by appliesTo', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/search`,
                    method: 'GET',
                    qs: {keyword: 'breast cancer', limit: 10, neighbors: 0},
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.body.result).to.have.property('length', 1);
            });
            test('retrieves by impliedBy', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/search`,
                    method: 'GET',
                    qs: {keyword: 'liver cancer', limit: 10, neighbors: 0},
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.body.result).to.have.property('length', 1);
            });
            test('Ignores supportedBy', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/search`,
                    method: 'GET',
                    qs: {keyword: 'article', limit: 10, neighbors: 0},
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.body.result).to.have.property('length', 0);
            });
            test('retrieves by relevance', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/search`,
                    method: 'GET',
                    qs: {keyword: 'vocab', limit: 10, neighbors: 0},
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.body.result).to.have.property('length', 3);
            });
            test('retrieves by either', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/search`,
                    method: 'GET',
                    qs: {keyword: 'cancer'},
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.status).to.equal(HTTP_STATUS.OK);
                expect(res.body.result).to.have.property('length', 2);
            });
            test('with skip', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/search`,
                    method: 'GET',
                    qs: {keyword: 'cancer', skip: 1},
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.status).to.equal(HTTP_STATUS.OK);
                expect(res.body.result).to.have.property('length', 1);
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
                        json: true,
                        uri: `${app.url}/${opt.route}`,
                        method: 'POST',
                        body: Object.assign({source}, opt.content),
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                    return res.body.result;
                }));
            });
            test('BAD REQUEST error on supportedBy undefined', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: disease1['@rid'],
                            impliedBy: [{target: disease1['@rid']}],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('must include an array property supportedBy');
            });
            test('BAD REQUEST error on supportedBy empty array', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: disease1['@rid'],
                            supportedBy: [],
                            impliedBy: [{target: disease1['@rid']}],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('must include an array property supportedBy');
            });
            test('BAD REQUEST error on supportedBy bad RID format', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: disease1['@rid'],
                            supportedBy: [{target: 'not an rid'}],
                            impliedBy: [{target: disease1['@rid']}],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('does not look like a valid RID');
            });
            test('BAD REQUEST error on impliedBy undefined', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: disease1['@rid'],
                            supportedBy: [{target: publication1['@rid']}],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('must include an array property impliedBy');
            });
            test('BAD REQUEST error on impliedBy empty array', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: disease1['@rid'],
                            impliedBy: [],
                            supportedBy: [{target: publication1['@rid']}],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('must include an array property impliedBy');
            });
            test('BAD REQUEST error on impliedBy bad RID format', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: disease1['@rid'],
                            impliedBy: [{target: 'not an rid'}],
                            supportedBy: [{target: publication1['@rid']}],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('does not look like a valid RID');
            });
            test('BAD REQUEST error in finding one of the dependencies', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: '#448989898:0',
                            impliedBy: [{target: disease1}],
                            supportedBy: [{target: publication1}],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('error in retrieving one or more of the dependencies');
            });
            test('BAD REQUEST error on missing relevance', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            appliesTo: disease1,
                            impliedBy: [{target: disease1}],
                            supportedBy: [{target: publication1}]
                        },
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('must have the relevance property');
            });
            test('BAD REQUEST error on missing appliesTo', async () => {
                let res;
                try {
                    res = await request({
                        json: true,
                        uri: `${app.url}/statements`,
                        method: 'POST',
                        body: {
                            impliedBy: [{target: disease1}],
                            supportedBy: [{target: publication1}],
                            relevance: relevance1
                        },
                        headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                    });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('must have the appliesTo property');
            });
            test('creates statement', async () => {
                const res = await request({
                    json: true,
                    uri: `${app.url}/statements`,
                    method: 'POST',
                    body: {
                        appliesTo: disease1,
                        impliedBy: [{target: disease2}],
                        supportedBy: [{target: publication1}],
                        relevance: relevance1
                    },
                    headers: {Authorization: mockToken, ...DEFAULT_HEADERS}
                });
                expect(res.status).to.equal(HTTP_STATUS.CREATED);
            });
        });
    });
});
