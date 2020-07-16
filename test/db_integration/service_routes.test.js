/**
 * Tests for extensions and service routes like parsing
 */
/**
 * Tests for building read only queries including their routing
 */
const requestPromise = require('request-promise');
const HTTP_STATUS = require('http-status-codes');

const { AppServer } = require('../../src');
const { generateToken } = require('../../src/routes/auth');

const { createEmptyDb, tearDownDb } = require('./util');

const request = async opt => requestPromise({ json: true, resolveWithFullResponse: true, ...opt });

const REALLY_LONG_TIME = 10000000000;
const TEST_TIMEOUT_MS = 100000;
jest.setTimeout(TEST_TIMEOUT_MS);

const describeWithAuth = process.env.GKB_DBS_PASS
    ? describe
    : describe.skip;

if (!process.env.GKB_DBS_PASS) {
    console.warn('Cannot run tests without database password (GKB_DBS_PASS)');
}

jest.mock('../../src/extensions/util', () => {
    const original = require.requireActual('../../src/extensions/util');
    return { ...original, requestWithRetry: jest.fn() };
});

const util = require('../../src/extensions/util');

describeWithAuth('service routes', () => {
    let db,
        app,
        mockToken;

    beforeAll(async () => {
        db = await createEmptyDb();
        const session = await db.pool.acquire();
        app = new AppServer({ ...db.conf, GKB_DB_CREATE: false, GKB_DISABLE_AUTH: true });

        await app.listen();
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
        await tearDownDb({ conf: db.conf, server: db.server }); // destroy the test db
        // close the db connections so that you can create more in the app.listen
        await db.pool.close();
        await db.server.close();
    });

    afterEach(async () => {
        jest.clearAllMocks();
    });

    describe('/parse', () => {
        test('parsed standard hgvs', async () => {
            const res = await request({
                body: {
                    content: 'KRAS:p.G12D',
                },
                method: 'POST',
                uri: `${app.url}/parse`,
            });
            expect(res.statusCode).toBe(HTTP_STATUS.OK);
            expect(typeof res.body.result).toBe('object');
            expect(res.body.result.reference1).toBe('KRAS');
            expect(res.body.result.break1Repr).toBe('p.G12');
            expect(res.body.result.untemplatedSeq).toBe('D');
        });

        test('fail on missing required body attribute content', async () => {
            try {
                await request({
                    body: {},
                    method: 'POST',
                    uri: `${app.url}/parse`,
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });

        test('allows missing feature when requireFeatures flag is false', async () => {
            const res = await request({
                body: { content: 'p.G12F', requireFeatures: false },
                method: 'POST',
                uri: `${app.url}/parse`,
            });
            expect(res.statusCode).toBe(HTTP_STATUS.OK);
            expect(typeof res.body.result).toBe('object');
            expect(res.body.result.break1Repr).toBe('p.G12');
            expect(res.body.result.untemplatedSeq).toBe('F');
        });

        test('error on missing features when requireFeatures flag is default or true', async () => {
            try {
                await request({
                    body: { content: 'p.G12F' },
                    method: 'POST',
                    uri: `${app.url}/parse`,
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });

        test('error on unexpected attribute', async () => {
            try {
                await request({
                    body: { content: 'KRAS:p.G12D', someOtherAttr: 'blargh' },
                    method: 'POST',
                    uri: `${app.url}/parse`,
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });
    });

    describe('/extensions', () => {
        // will need to mock requestWithRetry so we don't actually make requests to these external APIs
        test('parse pubmed record', async () => {
            // content retrieved directly from the pubmed API
            util.requestWithRetry.mockResolvedValueOnce({
                header: {
                    type: 'esummary',
                    version: '0.3',
                },
                result: {
                    30016509: {
                        articleids: [
                            {
                                idtype: 'pubmed',
                                idtypen: 1,
                                value: '30016509',
                            },
                            {
                                idtype: 'pii',
                                idtypen: 4,
                                value: '5055126',
                            },
                            {
                                idtype: 'doi',
                                idtypen: 3,
                                value: '10.1093/bioinformatics/bty621',
                            },
                            {
                                idtype: 'rid',
                                idtypen: 8,
                                value: '30016509',
                            },
                            {
                                idtype: 'eid',
                                idtypen: 8,
                                value: '30016509',
                            },
                        ],
                        attributes: [
                            'Has Abstract',
                        ],
                        authors: [
                            {
                                authtype: 'Author',
                                clusterid: '',
                                name: 'Reisle C',
                            },
                            {
                                authtype: 'Author',
                                clusterid: '',
                                name: 'Mungall KL',
                            },
                            {
                                authtype: 'Author',
                                clusterid: '',
                                name: 'Choo C',
                            },
                            {
                                authtype: 'Author',
                                clusterid: '',
                                name: 'Paulino D',
                            },
                            {
                                authtype: 'Author',
                                clusterid: '',
                                name: 'Bleile DW',
                            },
                            {
                                authtype: 'Author',
                                clusterid: '',
                                name: 'Muhammadzadeh A',
                            },
                            {
                                authtype: 'Author',
                                clusterid: '',
                                name: 'Mungall AJ',
                            },
                            {
                                authtype: 'Author',
                                clusterid: '',
                                name: 'Moore RA',
                            },
                            {
                                authtype: 'Author',
                                clusterid: '',
                                name: 'Shlafman I',
                            },
                            {
                                authtype: 'Author',
                                clusterid: '',
                                name: 'Coope R',
                            },
                            {
                                authtype: 'Author',
                                clusterid: '',
                                name: 'Pleasance S',
                            },
                            {
                                authtype: 'Author',
                                clusterid: '',
                                name: 'Ma Y',
                            },
                            {
                                authtype: 'Author',
                                clusterid: '',
                                name: 'Jones SJM',
                            },
                        ],
                        availablefromurl: '',
                        bookname: '',
                        booktitle: '',
                        chapter: '',
                        doccontriblist: [],
                        docdate: '',
                        doctype: 'citation',
                        edition: '',
                        elocationid: 'doi: 10.1093/bioinformatics/bty621',
                        epubdate: '',
                        essn: '1367-4811',
                        fulljournalname: 'Bioinformatics (Oxford, England)',
                        history: [
                            {
                                date: '2018/02/02 00:00',
                                pubstatus: 'received',
                            },
                            {
                                date: '2018/07/12 00:00',
                                pubstatus: 'accepted',
                            },
                            {
                                date: '2018/07/18 06:00',
                                pubstatus: 'pubmed',
                            },
                            {
                                date: '2018/07/18 06:00',
                                pubstatus: 'medline',
                            },
                            {
                                date: '2018/07/18 06:00',
                                pubstatus: 'entrez',
                            },
                        ],
                        issn: '1367-4803',
                        issue: '3',
                        lang: [
                            'eng',
                        ],
                        lastauthor: 'Jones SJM',
                        locationlabel: '',
                        medium: '',
                        nlmuniqueid: '9808944',
                        pages: '515-517',
                        pmcrefcount: 1,
                        pubdate: '2019 Feb 1',
                        publisherlocation: '',
                        publishername: '',
                        pubstatus: '4',
                        pubtype: [
                            'Journal Article',
                        ],
                        recordstatus: 'PubMed - in process',
                        references: [],
                        reportnumber: '',
                        sortfirstauthor: 'Reisle C',
                        sortpubdate: '2019/02/01 00:00',
                        sorttitle: 'mavis merging annotation validation and illustration of structural variants',
                        source: 'Bioinformatics',
                        srccontriblist: [],
                        srcdate: '',
                        title: 'MAVIS: merging, annotation, validation, and illustration of structural variants.',
                        uid: '30016509',
                        vernaculartitle: '',
                        volume: '35',
                    },
                    uids: [
                        '30016509',
                    ],
                },
            });
            const res = await request({
                headers: {
                    Authorization: mockToken,
                },
                method: 'GET',
                uri: `${app.url}/extensions/pubmed/30016509`,
            });
            expect(res.statusCode).toBe(HTTP_STATUS.OK);
            expect(res.body).toEqual({
                result: {
                    authors: 'Reisle C, Mungall KL, Choo C, Paulino D, Bleile DW, Muhammadzadeh A, Mungall AJ, Moore RA, Shlafman I, Coope R, Pleasance S, Ma Y, Jones SJM',
                    displayName: 'pmid:30016509',
                    doi: '10.1093/bioinformatics/bty621',
                    issue: '3',
                    journalName: 'Bioinformatics (Oxford, England)',
                    name: 'mavis merging annotation validation and illustration of structural variants',
                    pages: '515-517',
                    sourceId: '30016509',
                    url: 'https://pubmed.ncbi.nlm.nih.gov/30016509',
                    volume: '35',
                    year: 2019,
                },
            });
        });

        test('bad pubmed ID', async () => {
            // content retrieved directly from the pubmed API
            util.requestWithRetry.mockResolvedValueOnce({ result: {} });

            try {
                await request({
                    headers: {
                        Authorization: mockToken,
                    },
                    method: 'GET',
                    uri: `${app.url}/extensions/pubmed/NM_30016509`,
                });
            } catch ({ response }) {
                expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
                return;
            }
            throw new Error('Did not throw expected error');
        });

        test.todo('test clinical trial');

        test.todo('test entrez gene');
    });
});
