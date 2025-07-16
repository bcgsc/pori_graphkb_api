/* eslint-disable no-nested-ternary */
const uuidV4 = require('uuid/v4');

const { EDGE_RECORDS, NODE_RECORDS, RECORDS } = require('../repo/subgraphs/data');
const { getUserByName, create, update } = require('../../src/repo/commands');
const { logger } = require('../../src/repo/logging');
const { connectDB } = require('../../src/repo');
const { createConfig } = require('../../src');

const clearDB = async ({ session, admin }) => {
    // clear all V/E records
    await session.command('delete edge e').all();
    await session.command('delete vertex v').all();
    await session.command(`delete from user where name != '${admin.name}'`).all();
    await session.command('delete from usergroup where name != \'readonly\' and name != \'admin\' and name != \'regular\'').all();
};

const createEmptyDb = async () => {
    const conf = createConfig({
        GKB_DB_CREATE: true,
        GKB_DB_NAME: `test_${uuidV4()}`,
        GKB_DISABLE_AUTH: true,
        GKB_PORT: null,
        GKB_USER_CREATE: true,
    });
    const { server, pool } = await connectDB({ ...conf, GKB_NEW_DB: true });
    const session = await pool.acquire();
    const user = await getUserByName(session, process.env.USER || 'admin');
    session.close();
    return {
        admin: user, conf, pool, server,
    };
};

/**
 * Creates a RO DB to be used in testing complex queries
 */
const createSeededDb = async () => {
    const db = await createEmptyDb();
    const { pool, admin } = db;
    // create a source
    const session = await pool.acquire();
    const source = await create(
        session,
        { content: { name: 'default source' }, modelName: 'Source', user: admin },
    );

    const createRecord = async (opt) => create(
        session,
        { ...opt, content: { ...opt.content, source }, user: admin },
    );
    // create default record set
    const [
        mutation,
        substitution,
        gof,
        cancer,
        proliferation,
        carcinomas,
        kras,
        kras1,
        publication,
        sensitivity,
        resistance,
        drug,
    ] = await Promise.all([
        { content: { displayName: 'mutation', sourceId: 'mutation' }, modelName: 'Vocabulary' },
        { content: { displayName: 'substitution', sourceId: 'substitution' }, modelName: 'Vocabulary' },
        { content: { sourceId: 'gain of function' }, modelName: 'Vocabulary' },
        { content: { sourceId: 'cancer', subsets: ['singleSubset'] }, modelName: 'Disease' },
        { content: { sourceId: 'disease of cellular proliferation', subsets: ['wordy', 'singleSubset'] }, modelName: 'Disease' },
        { content: { sourceId: 'carcinomas' }, modelName: 'Disease' },
        { content: { biotype: 'gene', displayName: 'KRAS', sourceId: 'kras' }, modelName: 'Feature' },
        { content: { biotype: 'gene', displayName: 'KRAS1', sourceId: 'kras1' }, modelName: 'Feature' },
        { content: { sourceId: '1234' }, modelName: 'Publication' },
        { content: { sourceId: 'sensitivity' }, modelName: 'Vocabulary' },
        { content: { sourceId: 'resistance' }, modelName: 'Vocabulary' },
        { content: { sourceId: 'drug' }, modelName: 'Therapy' },
    ].map(createRecord));

    // update a record so there is something deleted we can test
    const query = `SELECT * FROM [${carcinomas['@rid']}]`;
    const carcinoma = await update(session, {
        changes: { sourceId: 'carcinoma' },
        modelName: 'Disease',
        query: {
            displayString: () => query,
            toString: () => ({ params: {}, query }),
        },
        user: db.admin,
    });

    // add some default relationships
    await Promise.all([
        { content: { in: proliferation, out: cancer }, modelName: 'AliasOf' },
        { content: { in: cancer, out: carcinoma }, modelName: 'SubClassOf' },
        { content: { in: mutation, out: substitution }, modelName: 'SubClassOf' },
        { content: { in: kras, out: kras1 }, modelName: 'DeprecatedBy' },
    ].map(createRecord));

    // create a positional variant
    const [krasSub, krasMut] = await Promise.all([
        create(session, {
            content: {
                break1Start: { '@class': 'ProteinPosition', pos: 12, refAA: 'G' },
                reference1: kras1,
                type: substitution,
                untemplatedSeq: 'D',
                untemplatedSeqSize: 1,
            },
            modelName: 'PositionalVariant',
            user: admin,
        }),
        create(session, {
            content: {
                reference1: kras,
                type: mutation,
            },
            modelName: 'CategoryVariant',
            user: admin,
        }),
    ]);
    await createRecord({ content: { in: krasMut, out: krasSub }, modelName: 'Infers' });
    // create a statement
    const [sensToDrug, resToDrug, mutIsGof] = await Promise.all([
        create(session, {
            content: {
                conditions: [cancer, krasMut, drug],
                evidence: [publication],
                relevance: sensitivity,
                subject: drug,
            },
            modelName: 'Statement',
            user: admin,
        }),
        create(session, {
            content: {
                conditions: [carcinoma, drug],
                evidence: [publication],
                relevance: resistance,
                subject: drug,
            },
            modelName: 'Statement',
            user: admin,
        }),
        create(session, {
            content: {
                conditions: [proliferation, krasMut, kras],
                evidence: [publication],
                relevance: gof,
                subject: kras,
            },
            modelName: 'Statement',
            user: admin,
        }),
    ]);

    await session.close();
    return {
        records: {
            cancer,
            carcinoma,
            kras,
            kras1,
            krasMut,
            krasSub,
            mutIsGof,
            proliferation,
            resToDrug,
            sensToDrug,
            source,
        },
        ...db,
    };
};

/**
 * Creates a RO DB to be used in testing subgraphs traversal queries.
 * Based on records in test/repo/subgraphs/data.js
 */
const createSeededDbForSubgraphs = async () => {
    // new DB & session
    const db = await createEmptyDb();
    const { pool, admin } = db;
    const session = await pool.acquire();

    /** sources based on RECORDS['source.sort']
     * so there is as many source as there is sorting priorities
    */
    const sources = new Map();
    const sourcesToRid = new Map();

    RECORDS.forEach((r) => {
        let s;

        if (typeof r['source.sort'] === 'number') {
            s = r['source.sort'];
        } else {
            s = 99999;
        }

        if (!sources.has(String(s))) {
            sources.set(String(s), { name: String(s), sort: s });
        }
    });

    for (const [k, v] of sources) {
        const src = await create(
            session,
            { content: { name: v.name, sort: v.sort }, modelName: 'Source', user: admin },
        );
        sourcesToRid.set(k, src);
    }

    // helper function for creating new records
    const createRecord = async (opt) => create(
        session,
        { ...opt, user: admin },
    );

    /** create node records */
    const vertexPayloads = [];
    const dataRidToVertexIndex = new Map();
    NODE_RECORDS.forEach((r) => {
        const {
            '@class': modelName,
            '@rid': dataRid,
            'source.sort': source,
            ...rest
        } = r;

        let src;

        if (typeof source === 'number') {
            src = source;
        } else {
            src = 99999;
        }

        const i = vertexPayloads.length;
        dataRidToVertexIndex.set(dataRid, i);

        vertexPayloads.push({
            content: {
                ...rest,
                source: sourcesToRid.get(String(src)),
                sourceId: String(src),
            },
            modelName,
        });
    });
    const V = await Promise.all(vertexPayloads.map(createRecord));

    /** create edge records */
    const edgesPayloads = [];
    EDGE_RECORDS.forEach((r) => {
        const {
            '@class': modelName,
            '@rid': rid,
            in: inNode,
            out: outNode,
            ...rest
        } = r;

        edgesPayloads.push({
            content: {
                ...rest,
                in: V[dataRidToVertexIndex.get(inNode)]['@rid'],
                out: V[dataRidToVertexIndex.get(outNode)]['@rid'],
            },
            modelName,
        });
    });
    const E = await Promise.all(edgesPayloads.map(createRecord));

    for (let i = 0; i < E.length; i++) {
        logger.debug(`created edge ${E[i]['@rid']}`);
    }

    await session.close();
    return {
        records: {
            e: E,
            v: V, // not including Source vertices
        },
        ...db,
    };
};

const tearDownDb = async ({ server, conf }) => {
    if (server) {
        await server.dropDatabase({
            name: conf.GKB_DB_NAME,
            password: conf.GKB_DBS_PASS,
            username: conf.GKB_DBS_USER,
        });
    }
};

module.exports = {
    clearDB,
    createEmptyDb,
    createSeededDb,
    createSeededDbForSubgraphs,
    tearDownDb,
};
