/**
 * Tests for extensions and service routes like parsing
 */
/**
 * Tests for building read only queries including their routing
 */
const requestPromise = require('request-promise');
const HTTP_STATUS = require('http-status-codes');

const {AppServer} = require('../../app');
const {generateToken} = require('../../app/routes/auth');

const {createEmptyDb, tearDownDb} = require('./util');

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

jest.mock('../../app/extensions/util', () => {
    const original = require.requireActual('../../app/extensions/util');
    return {...original, requestWithRetry: jest.fn()};
});

const util = require('../../app/extensions/util');

describeWithAuth('api crud routes', () => {
    let db,
        app,
        mockToken;
    beforeAll(async () => {
        db = await createEmptyDb();
        const session = await db.pool.acquire();
        app = new AppServer({...db.conf, GKB_DB_CREATE: false, GKB_DISABLE_AUTH: true});

        await app.listen();
        mockToken = await generateToken(
            session,
            db.admin.name,
            app.conf.GKB_KEY,
            REALLY_LONG_TIME
        );
        session.close();
    });
    afterAll(async () => {
        await tearDownDb({server: db.server, conf: db.conf}); // destroy the test db
        if (app) {
            await app.close(); // shut down the http server
        }
    });
    afterEach(async () => {
        jest.clearAllMocks();
    });

    describe('/parse', () => {
        test('parsed standard hgvs', async () => {
            const res = await request({
                uri: `${app.url}/parse`,
                body: {
                    content: 'KRAS:p.G12D'
                },
                method: 'POST'
            });
            expect(res.statusCode).toBe(HTTP_STATUS.OK);
            expect(typeof res.body.result).toBe('object');
            expect(res.body.result.reference1).toBe('KRAS');
            expect(res.body.result.break1Repr).toBe('p.G12');
            expect(res.body.result.untemplatedSeq).toBe('D');
        });
    });
    describe('/extensions', () => {
        // will need to mock requestWithRetry so we don't actually make requests to these external APIs
        test('parse pubmed record', async () => {
            // content retrieved directly from the pubmed API
            util.requestWithRetry.mockResolvedValueOnce({
                header: {
                    type: 'esummary',
                    version: '0.3'
                },
                result: {
                    uids: [
                        '30016509'
                    ],
                    30016509: {
                        uid: '30016509',
                        pubdate: '2019 Feb 1',
                        epubdate: '',
                        source: 'Bioinformatics',
                        authors: [
                            {
                                name: 'Reisle C',
                                authtype: 'Author',
                                clusterid: ''
                            },
                            {
                                name: 'Mungall KL',
                                authtype: 'Author',
                                clusterid: ''
                            },
                            {
                                name: 'Choo C',
                                authtype: 'Author',
                                clusterid: ''
                            },
                            {
                                name: 'Paulino D',
                                authtype: 'Author',
                                clusterid: ''
                            },
                            {
                                name: 'Bleile DW',
                                authtype: 'Author',
                                clusterid: ''
                            },
                            {
                                name: 'Muhammadzadeh A',
                                authtype: 'Author',
                                clusterid: ''
                            },
                            {
                                name: 'Mungall AJ',
                                authtype: 'Author',
                                clusterid: ''
                            },
                            {
                                name: 'Moore RA',
                                authtype: 'Author',
                                clusterid: ''
                            },
                            {
                                name: 'Shlafman I',
                                authtype: 'Author',
                                clusterid: ''
                            },
                            {
                                name: 'Coope R',
                                authtype: 'Author',
                                clusterid: ''
                            },
                            {
                                name: 'Pleasance S',
                                authtype: 'Author',
                                clusterid: ''
                            },
                            {
                                name: 'Ma Y',
                                authtype: 'Author',
                                clusterid: ''
                            },
                            {
                                name: 'Jones SJM',
                                authtype: 'Author',
                                clusterid: ''
                            }
                        ],
                        lastauthor: 'Jones SJM',
                        title: 'MAVIS: merging, annotation, validation, and illustration of structural variants.',
                        sorttitle: 'mavis merging annotation validation and illustration of structural variants',
                        volume: '35',
                        issue: '3',
                        pages: '515-517',
                        lang: [
                            'eng'
                        ],
                        nlmuniqueid: '9808944',
                        issn: '1367-4803',
                        essn: '1367-4811',
                        pubtype: [
                            'Journal Article'
                        ],
                        recordstatus: 'PubMed - in process',
                        pubstatus: '4',
                        articleids: [
                            {
                                idtype: 'pubmed',
                                idtypen: 1,
                                value: '30016509'
                            },
                            {
                                idtype: 'pii',
                                idtypen: 4,
                                value: '5055126'
                            },
                            {
                                idtype: 'doi',
                                idtypen: 3,
                                value: '10.1093/bioinformatics/bty621'
                            },
                            {
                                idtype: 'rid',
                                idtypen: 8,
                                value: '30016509'
                            },
                            {
                                idtype: 'eid',
                                idtypen: 8,
                                value: '30016509'
                            }
                        ],
                        history: [
                            {
                                pubstatus: 'received',
                                date: '2018/02/02 00:00'
                            },
                            {
                                pubstatus: 'accepted',
                                date: '2018/07/12 00:00'
                            },
                            {
                                pubstatus: 'pubmed',
                                date: '2018/07/18 06:00'
                            },
                            {
                                pubstatus: 'medline',
                                date: '2018/07/18 06:00'
                            },
                            {
                                pubstatus: 'entrez',
                                date: '2018/07/18 06:00'
                            }
                        ],
                        references: [],
                        attributes: [
                            'Has Abstract'
                        ],
                        pmcrefcount: 1,
                        fulljournalname: 'Bioinformatics (Oxford, England)',
                        elocationid: 'doi: 10.1093/bioinformatics/bty621',
                        doctype: 'citation',
                        srccontriblist: [],
                        booktitle: '',
                        medium: '',
                        edition: '',
                        publisherlocation: '',
                        publishername: '',
                        srcdate: '',
                        reportnumber: '',
                        availablefromurl: '',
                        locationlabel: '',
                        doccontriblist: [],
                        docdate: '',
                        bookname: '',
                        chapter: '',
                        sortpubdate: '2019/02/01 00:00',
                        sortfirstauthor: 'Reisle C',
                        vernaculartitle: ''
                    }
                }
            });
            const res = await request({
                uri: `${app.url}/extensions/pubmed/30016509`,
                method: 'GET',
                headers: {
                    Authorization: mockToken
                }
            });
            expect(res.statusCode).toBe(HTTP_STATUS.OK);
            expect(res.body).toEqual({
                result: {
                    sourceId: '30016509',
                    name: 'MAVIS: merging, annotation, validation, and illustration of structural variants.',
                    journalName: 'Bioinformatics (Oxford, England)',
                    year: 2019,
                    displayName: 'pmid:30016509'
                }
            });
        });
        test('bad pubmed ID', async () => {
            // content retrieved directly from the pubmed API
            util.requestWithRetry.mockResolvedValueOnce({result: {}});
            try {
                await request({
                    uri: `${app.url}/extensions/pubmed/NM_30016509`,
                    method: 'GET',
                    headers: {
                        Authorization: mockToken
                    }
                });
            } catch ({response}) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });
        test.todo('test clinical trial');
        test.todo('test entrez gene');
    });
});
