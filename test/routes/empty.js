

const {
    expect
} = require('chai');
const chai = require('chai');
const chaiHttp = require('chai-http');
const HTTP_STATUS = require('http-status-codes');

const {
    setUpEmptyDB, clearDB
} = require('./../util');
const {generateToken} = require('./../../app/routes/auth');

chai.use(chaiHttp);

const REALLY_LONG_TIME = 10000000000;
const TEST_TIMEOUT_MS = 50000;
jest.setTimeout(TEST_TIMEOUT_MS);

/**
 * Mocks a set of 3 disease records related as aliases
 */
const mockRelatedDiseases = async ({app, mockToken, source}) => {
    const res1 = await chai.request(app.url)
        .post('/diseases')
        .type('json')
        .send({
            sourceId: 'cancer',
            source
        })
        .set('Authorization', mockToken);
    const res2 = await chai.request(app.url)
        .post('/diseases')
        .type('json')
        .send({
            sourceId: 'carcinoma',
            source
        })
        .set('Authorization', mockToken);
    await chai.request(app.url)
        .post('/aliasof')
        .type('json')
        .send({
            out: res1.body.result['@rid'],
            in: res2.body.result['@rid'],
            source
        })
        .set('Authorization', mockToken);
    const res3 = await chai.request(app.url)
        .post('/diseases')
        .type('json')
        .send({
            sourceId: 'disease of cellular proliferation',
            source
        })
        .set('Authorization', mockToken);
    const res4 = await chai.request(app.url)
        .post('/aliasof')
        .type('json')
        .send({
            out: res1.body.result['@rid'],
            in: res3.body.result['@rid'],
            source
        })
        .set('Authorization', mockToken);
    await chai.request(app.url)
        .delete(`/diseases/${res2.body.result['@rid'].slice(1)}`)
        .set('Authorization', mockToken);
    await chai.request(app.url)
        .delete(`/aliasof/${res4.body.result['@rid'].slice(1)}`)
        .set('Authorization', mockToken);

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
            const res = await chai.request(app.url)
                .get('/stats')
                .type('json')
                .set('Authorization', mockToken);
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
            const res = await chai.request(app.url)
                .post('/sources')
                .type('json')
                .send({
                    name: 'bcgsc',
                    version: '2018'
                })
                .set('Authorization', mockToken);
            source = res.body.result;
        });
        describe('GET /users', () => {
            test('name', async () => {
                const res = await chai.request(app.url)
                    .get(`/users?name=${admin.name}`)
                    .set('Authorization', mockToken);
                expect(res.status).to.equal(HTTP_STATUS.OK);
                expect(res.body.result).to.be.a('array');
                expect(res.body.result.length).to.equal(1);
                expect(res.body.result[0].name).to.equal(admin.name);
            });
            test('aggregates the count', async () => {
                const res = await chai.request(app.url)
                    .get('/users?count=true')
                    .set('Authorization', mockToken);
                expect(res.status).to.equal(HTTP_STATUS.OK);
                expect(res.body.result).to.eql([{count: 1}]);
            });
        });
        describe('POST /users/search', () => {
            test('name', async () => {
                const res = await chai.request(app.url)
                    .post('/users/search')
                    .set('Authorization', mockToken)
                    .type('json')
                    .send({
                        where: [
                            {attr: 'name', value: admin.name}
                        ],
                        neighbors: 1,
                        limit: 10
                    });
                expect(res.status).to.equal(HTTP_STATUS.OK);
                expect(res.body.result).to.be.a('array');
                expect(res.body.result.length).to.equal(1);
                expect(res.body.result[0].name).to.equal(admin.name);
            });
            test('BAD REQUEST for query params', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .post('/users/search?neighbors=1')
                        .set('Authorization', mockToken)
                        .type('json')
                        .send({
                            where: [
                                {attr: 'name', value: admin.name}
                            ],
                            neighbors: 1,
                            limit: 10
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
                const res = await chai.request(app.url)
                    .post('/users')
                    .type('json')
                    .send({
                        name: 'blargh monkeys'
                    })
                    .set('Authorization', mockToken);
                expect(res.status).to.equal(HTTP_STATUS.CREATED);
                expect(res.body.result).to.be.a('object');
                expect(res.body.result.name).to.equal('blargh monkeys');
            });
            test('BAD REQUEST', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .post('/users')
                        .type('json')
                        .send({
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('name', 'ValidationError');
            });
            test('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .post('/users')
                        .type('json')
                        .send({
                            name: 'blargh monkeys'
                        });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.UNAUTHORIZED);
            });
            test('CONFLICT', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .post('/users')
                        .type('json')
                        .set('Authorization', mockToken)
                        .send({
                            name: admin.name
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
                const res = await chai.request(app.url)
                    .get('/usergroups')
                    .type('json')
                    .set('Authorization', mockToken);
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
                user = (await chai.request(app.url)
                    .post('/users')
                    .type('json')
                    .send({
                        name: 'alice',
                        groups: [readyOnly['@rid']]
                    })
                    .set('Authorization', mockToken)
                ).body.result;
            });
            test('modify the group associated with a user', async () => {
                const updatedUser = (await chai.request(app.url)
                    .patch(`/users/${user['@rid'].slice(1)}`)
                    .type('json')
                    .send({groups: [adminGroup['@rid']]})
                    .set('Authorization', mockToken)
                ).body.result;
                expect(updatedUser).to.have.property('groups');
                expect(updatedUser.groups).to.have.property('length', 1);
                expect(updatedUser.groups[0]).to.equal(adminGroup['@rid']);
                expect(updatedUser).to.have.property('name', 'alice');
            });
            test('rename the user', async () => {
                const updatedUser = (await chai.request(app.url)
                    .patch(`/users/${user['@rid'].slice(1)}`)
                    .type('json')
                    .send({name: 'bob'})
                    .set('Authorization', mockToken)
                ).body.result;
                expect(updatedUser).to.have.property('groups');
                expect(updatedUser.groups).to.have.property('length', 1);
                expect(updatedUser.groups[0]).to.equal(readyOnly['@rid']);
                expect(updatedUser).to.have.property('name', 'bob');
            });
        });
        describe('DELETE /users/{rid}', () => {
            let readyOnly,
                adminGroup,
                user;
            beforeEach(async () => {
                const res = await chai.request(app.url)
                    .get('/usergroups')
                    .type('json')
                    .set('Authorization', mockToken);
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
                user = (await chai.request(app.url)
                    .post('/users')
                    .type('json')
                    .send({
                        name: 'alice',
                        groups: [readyOnly['@rid']]
                    })
                    .set('Authorization', mockToken)
                ).body.result;
            });
            test('delete the current user', async () => {
                const updatedUser = (await chai.request(app.url)
                    .delete(`/users/${user['@rid'].slice(1)}`)
                    .type('json')
                    .set('Authorization', mockToken)
                ).body.result;
                expect(updatedUser).to.have.property('deletedAt');
                expect(updatedUser.deletedBy).to.equal(admin['@rid'].toString());
            });
        });
        test('POST /usergroups', async () => {
            const group = (await chai.request(app.url)
                .post('/usergroups')
                .type('json')
                .send({
                    name: 'wonderland',
                    permissions: {V: 15}
                })
                .set('Authorization', mockToken)
            ).body.result;
            expect(group).to.have.property('createdAt');
            expect(group).to.have.property('@class', 'UserGroup');
            expect(group.permissions).to.have.property('@class', 'Permissions');
        });
        describe('PATCH /usergroups/{rid}', () => {
            let group;
            beforeEach(async () => {
                group = (await chai.request(app.url)
                    .post('/usergroups')
                    .type('json')
                    .send({
                        name: 'wonderland',
                        permissions: {V: 15}
                    })
                    .set('Authorization', mockToken)
                ).body.result;
            });
            test('modify permissions', async () => {
                const updated = (await chai.request(app.url)
                    .patch(`/usergroups/${group['@rid'].toString().slice(1)}`)
                    .type('json')
                    .send({
                        permissions: {V: 15, E: 15}
                    })
                    .set('Authorization', mockToken)
                ).body.result;
                expect(updated).to.have.property('@rid', group['@rid'].toString());
                expect(updated).to.have.property('history');
            });
        });
        describe('GET /features', () => {
            test('BAD REQUEST on invalid biotype', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .get('/features?biotype=blargh')
                        .type('json')
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('name', 'ValidationError');
            });
            test('BAD REQUEST on invalid special query param', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .get('/features?neighbors=-1')
                        .type('json')
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('name', 'ValidationError');
            });
            test('aggregates on count', async () => {
                const res = await chai.request(app.url)
                    .get('/features?count=t')
                    .type('json')
                    .set('Authorization', mockToken);
                expect(res.body.result).to.eql([{count: 0}]);
            });
        });
        describe('GET /features/{rid}', () => {
            test('BAD REQUEST on invalid rid', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .get('/features/kme')
                        .type('json')
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('name', 'ValidationError');
            });
        });
        describe('POST /diseases', () => {
            test('OK', async () => {
                const res = await chai.request(app.url)
                    .post('/diseases')
                    .type('json')
                    .send({
                        sourceId: 'cancer',
                        source
                    })
                    .set('Authorization', mockToken);
                expect(res.status).to.equal(HTTP_STATUS.CREATED);
                expect(res.body.result).to.be.a('object');
                expect(res.body.result).to.have.property('sourceId', 'cancer');
                expect(res.body.result.source).to.eql(source['@rid']);
            });
            test('BAD REQUEST (no source given)', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .post('/diseases')
                        .type('json')
                        .send({
                            sourceId: 'cancer'
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('name', 'ValidationError');
            });
            test('BAD REQUEST (no sourceId given)', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .post('/diseases')
                        .type('json')
                        .send({
                            source
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('name', 'ValidationError');
            });
            test('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .post('/diseases')
                        .type('json')
                        .send({
                            sourceId: 'cancer',
                            source
                        });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.UNAUTHORIZED);
            });
            test('CONFLICT', async () => {
                let res;
                res = await chai.request(app.url)
                    .post('/diseases')
                    .type('json')
                    .send({
                        sourceId: 'cancer',
                        source
                    })
                    .set('Authorization', mockToken);
                expect(res.status).to.equal(HTTP_STATUS.CREATED);
                try {
                    res = await chai.request(app.url)
                        .post('/diseases')
                        .type('json')
                        .send({
                            sourceId: 'cancer',
                            source
                        })
                        .set('Authorization', mockToken);
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
                const res = await chai.request(app.url)
                    .post('/diseases')
                    .type('json')
                    .send({
                        sourceId: 'cancer',
                        source
                    })
                    .set('Authorization', mockToken);
                disease = res.body.result;
                diseaseId = disease['@rid'].replace('#', '');
            });
            test('OK', async () => {
                const res = await chai.request(app.url)
                    .patch(`/diseases/${diseaseId}`)
                    .type('json')
                    .send({
                        sourceId: 'carcinoma'
                    })
                    .set('Authorization', mockToken);
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
                    res = await chai.request(app.url)
                        .patch('/diseases/456:0')
                        .type('json')
                        .send({
                            sourceId: 'cancer'
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.NOT_FOUND);
                expect(res.body).to.have.property('name', 'NoRecordFoundError');
            });
            test('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .patch(`/diseases/${diseaseId}`)
                        .type('json')
                        .send({
                            sourceId: 'cancer',
                            source
                        });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.UNAUTHORIZED);
            });
            test('CONFLICT', async () => {
                let res;
                res = await chai.request(app.url)
                    .post('/diseases')
                    .type('json')
                    .send({
                        sourceId: 'carcinoma',
                        source
                    })
                    .set('Authorization', mockToken);
                expect(res.status).to.equal(HTTP_STATUS.CREATED);
                try {
                    res = await chai.request(app.url)
                        .patch(`/diseases/${diseaseId}`)
                        .type('json')
                        .send({
                            sourceId: 'carcinoma'
                        })
                        .set('Authorization', mockToken);
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
                const res = await chai.request(app.url)
                    .post('/diseases')
                    .type('json')
                    .send({
                        sourceId: 'cancer',
                        source
                    })
                    .set('Authorization', mockToken);
                disease = res.body.result;
                diseaseId = res.body.result['@rid'].replace('#', '');
            });
            test('OK', async () => {
                const res = await chai.request(app.url)
                    .delete(`/diseases/${diseaseId}`)
                    .type('json')
                    .set('Authorization', mockToken);
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
                    res = await chai.request(app.url)
                        .delete('/diseases/456:0')
                        .type('json')
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.NOT_FOUND);
                expect(res.body).to.have.property('name', 'NoRecordFoundError');
            });
            test('UNAUTHORIZED', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .delete(`/diseases/${diseaseId}`)
                        .type('json');
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
                const res = await chai.request(app.url)
                    .get('/diseases')
                    .set('Authorization', mockToken)
                    .query({neighbors: 2});
                expect(res.body.result[0]).to.have.property('sourceId', 'cancer');
                expect(res.body.result[0]).to.have.property('out_AliasOf');
                expect(res.body.result[0].out_AliasOf).to.eql([]);
            });
            test('neighborhood query returns both', async () => {
                const res = await chai.request(app.url)
                    .post('/diseases/search')
                    .set('Authorization', mockToken)
                    .type('json')
                    .send({
                        type: 'neighborhood',
                        where: {attr: 'sourceId', value: 'cancer'},
                        neighbors: 2
                    });
                expect(res.body.result[0]).to.have.property('sourceId', 'cancer');
                expect(res.body.result[0]).to.have.property('out_AliasOf');
                expect(res.body.result[0].out_AliasOf).to.eql([]);
            });
            test('includes deleted when not limited to active', async () => {
                const res = await chai.request(app.url)
                    .get('/diseases')
                    .set('Authorization', mockToken)
                    .query({neighbors: 2, activeOnly: false});
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
                const res = await chai.request(app.url)
                    .get('/records')
                    .set('Authorization', mockToken)
                    .query({rid: `${record1},${record2}`});
                expect(res.body.result).to.have.property('length', 2);
            });
            test('fails for properly formatted non-existant cluster RID', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .get('/records')
                        .set('Authorization', mockToken)
                        .query({rid: `${record1},1111:1111`});
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.NOT_FOUND);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('One or more invalid record cluster IDs (<cluster>:#)');
            });
            test('Ignores non-existant RID on a valid cluster', async () => {
                const res = await chai.request(app.url)
                    .get('/records')
                    .set('Authorization', mockToken)
                    .query({rid: `${record1},1:1111`});
                expect(res.body.result).to.have.property('length', 1);
            });
            test('error on bad neighbors argument', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .get('/records')
                        .set('Authorization', mockToken)
                        .query({
                            rid: `${record1}`,
                            neighbors: 'k'
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
                    res = await chai.request(app.url)
                        .get('/records')
                        .set('Authorization', mockToken)
                        .query({
                            rid: `${record1}`,
                            limit: 100
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
                    res = await chai.request(app.url)
                        .get('/records')
                        .set('Authorization', mockToken)
                        .query({
                            rid: `${record1},7`
                        });
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('not a valid RID');
            });
            test('ignores deleted records', async () => {
                const res = await chai.request(app.url)
                    .get('/records')
                    .set('Authorization', mockToken)
                    .query({rid: `${record1},${record2},${deletedRecord}`});
                expect(res.body.result).to.have.property('length', 2);
            });
            test('includes deleted records when activeOnly off', async () => {
                const res = await chai.request(app.url)
                    .get('/records')
                    .set('Authorization', mockToken)
                    .query({
                        rid: `${record1},${record2},${deletedRecord}`,
                        activeOnly: false
                    });
                expect(res.body.result).to.have.property('length', 3);
            });
        });
        describe('GET /ontologies', () => {
            beforeEach(async () => {
                await chai.request(app.url)
                    .post('/diseases')
                    .type('json')
                    .send({
                        sourceId: '2',
                        name: 'liver cancer',
                        source,
                        subsets: ['A', 'B', 'C', 'd']
                    })
                    .set('Authorization', mockToken);
            });
            test('Does not throw permissions error', async () => {
                const resp = await chai.request(app.url)
                    .get('/ontologies')
                    .type('json')
                    .set('Authorization', mockToken);
                expect(resp.body).to.have.property('result');
                expect(resp.body.result).to.have.property('length', 1);
            });
            test('query by subset single term', async () => {
                const resp = await chai.request(app.url)
                    .get('/ontologies')
                    .type('json')
                    .query({subsets: 'a'})
                    .set('Authorization', mockToken);
                expect(resp.body).to.have.property('result');
                expect(resp.body.result).to.have.property('length', 1);
            });
        });
        describe('Query FULLTEXT index', () => {
            beforeEach(async () => {
                await chai.request(app.url)
                    .post('/diseases')
                    .type('json')
                    .send({
                        sourceId: '2',
                        name: 'liver cancer',
                        source
                    })
                    .set('Authorization', mockToken);
                await chai.request(app.url)
                    .post('/diseases')
                    .type('json')
                    .send({
                        sourceId: '3',
                        name: 'breast cancer',
                        source
                    })
                    .set('Authorization', mockToken);
                await chai.request(app.url)
                    .post('/diseases')
                    .type('json')
                    .send({
                        sourceId: '1',
                        name: 'liver angiosarcoma',
                        source
                    })
                    .set('Authorization', mockToken);
            });
            test('requires all terms', async () => {
                const res = await chai.request(app.url)
                    .get('/diseases')
                    .type('json')
                    .query({name: '~liver cancer'})
                    .set('Authorization', mockToken);
                expect(res.status).to.equal(HTTP_STATUS.OK);
                expect(res.body.result).to.have.property('length', 1);

                expect(res.body.result[0]).to.have.property('name', 'liver cancer');
            });
            test('ignores case (due to cast)', async () => {
                const res = await chai.request(app.url)
                    .get('/diseases')
                    .type('json')
                    .query({name: '~CAncer'})
                    .set('Authorization', mockToken);
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
                liverCancer = (await chai.request(app.url)
                    .post('/diseases')
                    .type('json')
                    .send({
                        sourceId: '2',
                        name: 'liver cancer',
                        source
                    })
                    .set('Authorization', mockToken)).body.result['@rid'];
                breastCancer = (await chai.request(app.url)
                    .post('/diseases')
                    .type('json')
                    .send({
                        sourceId: '3',
                        name: 'breast cancer',
                        source
                    })
                    .set('Authorization', mockToken)).body.result['@rid'];
                liverAngiosarc = (await chai.request(app.url)
                    .post('/diseases')
                    .type('json')
                    .send({
                        sourceId: '1',
                        name: 'liver angiosarcoma',
                        source
                    })
                    .set('Authorization', mockToken)).body.result['@rid'];
                publication = (await chai.request(app.url)
                    .post('/publications')
                    .type('json')
                    .send({
                        sourceId: 'article',
                        name: 'article',
                        source
                    })
                    .set('Authorization', mockToken)).body.result['@rid'];
                vocab = (await chai.request(app.url)
                    .post('/vocabulary')
                    .type('json')
                    .send({
                        sourceId: 'vocab',
                        name: 'vocab',
                        source
                    })
                    .set('Authorization', mockToken)).body.result['@rid'];
                feature = (await chai.request(app.url)
                    .post('/features')
                    .type('json')
                    .send({
                        sourceId: 'gene',
                        name: 'gene',
                        source,
                        biotype: 'gene'
                    })
                    .set('Authorization', mockToken)).body.result['@rid'];
                // now create the statements
                await chai.request(app.url)
                    .post('/statements')
                    .type('json')
                    .send({
                        appliesTo: feature,
                        relevance: vocab,
                        impliedBy: [{target: liverAngiosarc}],
                        supportedBy: [{target: publication}]
                    })
                    .set('Authorization', mockToken);
                await chai.request(app.url)
                    .post('/statements')
                    .type('json')
                    .send({
                        appliesTo: feature,
                        relevance: vocab,
                        impliedBy: [{target: liverAngiosarc}, {target: liverCancer}],
                        supportedBy: [{target: publication}]
                    })
                    .set('Authorization', mockToken);
                await chai.request(app.url)
                    .post('/statements')
                    .type('json')
                    .send({
                        appliesTo: breastCancer,
                        relevance: vocab,
                        impliedBy: [{target: liverAngiosarc}],
                        supportedBy: [{target: publication}]
                    })
                    .set('Authorization', mockToken);
            });
            test('retrieves by appliesTo', async () => {
                const res = await chai.request(app.url)
                    .get('/search')
                    .type('json')
                    .query({keyword: 'breast cancer', limit: 10, neighbors: 0})
                    .set('Authorization', mockToken);
                expect(res.body.result).to.have.property('length', 1);
            });
            test('retrieves by impliedBy', async () => {
                const res = await chai.request(app.url)
                    .get('/search')
                    .type('json')
                    .query({keyword: 'liver cancer', limit: 10, neighbors: 0})
                    .set('Authorization', mockToken);
                expect(res.body.result).to.have.property('length', 1);
            });
            test('Ignores supportedBy', async () => {
                const res = await chai.request(app.url)
                    .get('/search')
                    .type('json')
                    .query({keyword: 'article', limit: 10, neighbors: 0})
                    .set('Authorization', mockToken);
                expect(res.body.result).to.have.property('length', 0);
            });
            test('retrieves by relevance', async () => {
                const res = await chai.request(app.url)
                    .get('/search')
                    .type('json')
                    .query({keyword: 'vocab', limit: 10, neighbors: 0})
                    .set('Authorization', mockToken);
                expect(res.body.result).to.have.property('length', 3);
            });
            test('retrieves by either', async () => {
                const res = await chai.request(app.url)
                    .get('/search')
                    .type('json')
                    .query({keyword: 'cancer'})
                    .set('Authorization', mockToken);
                expect(res.status).to.equal(HTTP_STATUS.OK);
                expect(res.body.result).to.have.property('length', 2);
            });
            test('with skip', async () => {
                const res = await chai.request(app.url)
                    .get('/search')
                    .type('json')
                    .query({keyword: 'cancer', skip: 1})
                    .set('Authorization', mockToken);
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
                    const res = await chai.request(app.url)
                        .post(`/${opt.route}`)
                        .type('json')
                        .set('Authorization', mockToken)
                        .send(Object.assign({source}, opt.content));
                    return res.body.result;
                }));
            });
            test('BAD REQUEST error on supportedBy undefined', async () => {
                let res;
                try {
                    res = await chai.request(app.url)
                        .post('/statements')
                        .type('json')
                        .send({
                            appliesTo: disease1['@rid'],
                            impliedBy: [{target: disease1['@rid']}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
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
                    res = await chai.request(app.url)
                        .post('/statements')
                        .type('json')
                        .send({
                            appliesTo: disease1['@rid'],
                            supportedBy: [],
                            impliedBy: [{target: disease1['@rid']}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
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
                    res = await chai.request(app.url)
                        .post('/statements')
                        .type('json')
                        .send({
                            appliesTo: disease1['@rid'],
                            supportedBy: [{target: 'not an rid'}],
                            impliedBy: [{target: disease1['@rid']}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
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
                    res = await chai.request(app.url)
                        .post('/statements')
                        .type('json')
                        .send({
                            appliesTo: disease1['@rid'],
                            supportedBy: [{target: publication1['@rid']}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
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
                    res = await chai.request(app.url)
                        .post('/statements')
                        .type('json')
                        .send({
                            appliesTo: disease1['@rid'],
                            impliedBy: [],
                            supportedBy: [{target: publication1['@rid']}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
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
                    res = await chai.request(app.url)
                        .post('/statements')
                        .type('json')
                        .send({
                            appliesTo: disease1['@rid'],
                            impliedBy: [{target: 'not an rid'}],
                            supportedBy: [{target: publication1['@rid']}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
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
                    res = await chai.request(app.url)
                        .post('/statements')
                        .type('json')
                        .send({
                            appliesTo: '#448989898:0',
                            impliedBy: [{target: disease1}],
                            supportedBy: [{target: publication1}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
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
                    res = await chai.request(app.url)
                        .post('/statements')
                        .type('json')
                        .send({
                            appliesTo: disease1,
                            impliedBy: [{target: disease1}],
                            supportedBy: [{target: publication1}]
                        })
                        .set('Authorization', mockToken);
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
                    res = await chai.request(app.url)
                        .post('/statements')
                        .type('json')
                        .send({
                            impliedBy: [{target: disease1}],
                            supportedBy: [{target: publication1}],
                            relevance: relevance1
                        })
                        .set('Authorization', mockToken);
                } catch (err) {
                    res = err.response;
                }
                expect(res.status).to.equal(HTTP_STATUS.BAD_REQUEST);
                expect(res.body).to.have.property('message');
                expect(res.body.message).to.include('must have the appliesTo property');
            });
            test('creates statement', async () => {
                const res = await chai.request(app.url)
                    .post('/statements')
                    .type('json')
                    .send({
                        appliesTo: disease1,
                        impliedBy: [{target: disease2}],
                        supportedBy: [{target: publication1}],
                        relevance: relevance1
                    })
                    .set('Authorization', mockToken);
                expect(res.status).to.equal(HTTP_STATUS.CREATED);
            });
        });
    });
});
