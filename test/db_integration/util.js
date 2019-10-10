const uuidV4 = require('uuid/v4');

const { schema: { schema } } = require('@bcgsc/knowledgebase-schema');


const { getUserByName, create, update } = require('../../src/repo/commands');
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
        GKB_DISABLE_AUTH: true,
        GKB_PORT: null,
        GKB_DB_NAME: `test_${uuidV4()}`,
        GKB_DB_CREATE: true,
        GKB_USER_CREATE: true,
    });
    const { server, pool } = await connectDB(conf);
    const session = await pool.acquire();
    const user = await getUserByName(session, process.env.USER || 'admin');
    session.close();
    return {
        pool, conf, admin: user, server,
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
        { content: { name: 'default source' }, model: schema.Source, user: admin },
    );

    const createRecord = async opt => create(
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
        { content: { sourceId: 'mutation', displayName: 'mutation' }, model: schema.Vocabulary },
        { content: { sourceId: 'substitution', displayName: 'substitution' }, model: schema.Vocabulary },
        { content: { sourceId: 'gain of function' }, model: schema.Vocabulary },
        { content: { sourceId: 'cancer', subsets: ['singleSubset'] }, model: schema.Disease },
        { content: { sourceId: 'disease of cellular proliferation', subsets: ['wordy', 'singleSubset'] }, model: schema.Disease },
        { content: { sourceId: 'carcinomas' }, model: schema.Disease },
        { content: { sourceId: 'kras', biotype: 'gene', displayName: 'KRAS' }, model: schema.Feature },
        { content: { sourceId: 'kras1', biotype: 'gene', displayName: 'KRAS1' }, model: schema.Feature },
        { content: { sourceId: '1234' }, model: schema.Publication },
        { content: { sourceId: 'sensitivity' }, model: schema.Vocabulary },
        { content: { sourceId: 'resistance' }, model: schema.Vocabulary },
        { content: { sourceId: 'drug' }, model: schema.Therapy },
    ].map(createRecord));

    // update a record so there is something deleted we can test
    const query = `SELECT * FROM [${carcinomas['@rid']}]`;
    const carcinoma = await update(session, {
        changes: { sourceId: 'carcinoma' },
        user: db.admin,
        model: schema.Disease,
        query: {
            toString: () => ({ query, params: {} }),
            displayString: () => query,
        },
    });

    // add some default relationships
    await Promise.all([
        { content: { out: cancer, in: proliferation }, model: schema.AliasOf },
        { content: { out: carcinoma, in: cancer }, model: schema.SubClassOf },
        { content: { out: substitution, in: mutation }, model: schema.SubClassOf },
        { content: { out: kras1, in: kras }, model: schema.DeprecatedBy },
    ].map(createRecord));

    // create a positional variant
    const [krasSub, krasMut] = await Promise.all([
        create(session, {
            content: {
                reference1: kras1,
                type: substitution,
                break1Start: { refAA: 'G', pos: 12, '@class': 'ProteinPosition' },
                untemplatedSeq: 'D',
                untemplatedSeqSize: 1,
            },
            model: schema.PositionalVariant,
            user: admin,
        }),
        create(session, {
            content: {
                reference1: kras,
                type: mutation,
            },
            model: schema.CategoryVariant,
            user: admin,
        }),
    ]);
    await createRecord({ content: { out: krasSub, in: krasMut }, model: schema.Infers });
    // create a statement
    const [sensToDrug, resToDrug, mutIsGof] = await Promise.all([
        create(session, {
            content: {
                relevance: sensitivity,
                subject: drug,
                conditions: [cancer, krasMut],
                evidence: [publication],
            },
            user: admin,
            model: schema.Statement,
        }),
        create(session, {
            content: {
                relevance: resistance,
                subject: drug,
                conditions: [carcinoma],
                evidence: [publication],
            },
            user: admin,
            model: schema.Statement,
        }),
        create(session, {
            content: {
                relevance: gof,
                subject: kras,
                conditions: [proliferation, krasMut],
                evidence: [publication],
            },
            user: admin,
            model: schema.Statement,
        }),
    ]);
    await session.close();
    return {
        records: {
            source,
            sensToDrug,
            resToDrug,
            mutIsGof,
            krasMut,
            krasSub,
            kras,
            kras1,
            cancer,
            carcinoma,
            proliferation,
        },
        ...db,
    };
};


const tearDownDb = async ({ server, conf }) => {
    if (server) {
        await server.dropDatabase({
            name: conf.GKB_DB_NAME,
            username: conf.GKB_DBS_USER,
            password: conf.GKB_DBS_PASS,
        });
    }
};

module.exports = {
    clearDB, createEmptyDb, createSeededDb, tearDownDb,
};
