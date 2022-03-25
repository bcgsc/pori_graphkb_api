import uuidV4 from 'uuid/v4';

import * as gkbSchema from '@bcgsc-pori/graphkb-schema';
const { schema: { schema } } = gkbSchema;

import { getUserByName, create, update } from '../../src/repo/commands';
import { connectDB } from '../../src/repo';
import { createConfig } from '../../src';

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
        { content: { name: 'default source' }, model: schema.Source, user: admin },
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
        { content: { displayName: 'mutation', sourceId: 'mutation' }, model: schema.Vocabulary },
        { content: { displayName: 'substitution', sourceId: 'substitution' }, model: schema.Vocabulary },
        { content: { sourceId: 'gain of function' }, model: schema.Vocabulary },
        { content: { sourceId: 'cancer', subsets: ['singleSubset'] }, model: schema.Disease },
        { content: { sourceId: 'disease of cellular proliferation', subsets: ['wordy', 'singleSubset'] }, model: schema.Disease },
        { content: { sourceId: 'carcinomas' }, model: schema.Disease },
        { content: { biotype: 'gene', displayName: 'KRAS', sourceId: 'kras' }, model: schema.Feature },
        { content: { biotype: 'gene', displayName: 'KRAS1', sourceId: 'kras1' }, model: schema.Feature },
        { content: { sourceId: '1234' }, model: schema.Publication },
        { content: { sourceId: 'sensitivity' }, model: schema.Vocabulary },
        { content: { sourceId: 'resistance' }, model: schema.Vocabulary },
        { content: { sourceId: 'drug' }, model: schema.Therapy },
    ].map(createRecord));

    // update a record so there is something deleted we can test
    const query = `SELECT * FROM [${carcinomas['@rid']}]`;
    const carcinoma = await update(session, {
        changes: { sourceId: 'carcinoma' },
        model: schema.Disease,
        query: {
            displayString: () => query,
            toString: () => ({ params: {}, query }),
        },
        user: db.admin,
    });

    // add some default relationships
    await Promise.all([
        { content: { in: proliferation, out: cancer }, model: schema.AliasOf },
        { content: { in: cancer, out: carcinoma }, model: schema.SubClassOf },
        { content: { in: mutation, out: substitution }, model: schema.SubClassOf },
        { content: { in: kras, out: kras1 }, model: schema.DeprecatedBy },
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
    await createRecord({ content: { in: krasMut, out: krasSub }, model: schema.Infers });
    // create a statement
    const [sensToDrug, resToDrug, mutIsGof] = await Promise.all([
        create(session, {
            content: {
                conditions: [cancer, krasMut, drug],
                evidence: [publication],
                relevance: sensitivity,
                subject: drug,
            },
            model: schema.Statement,
            user: admin,
        }),
        create(session, {
            content: {
                conditions: [carcinoma, drug],
                evidence: [publication],
                relevance: resistance,
                subject: drug,
            },
            model: schema.Statement,
            user: admin,
        }),
        create(session, {
            content: {
                conditions: [proliferation, krasMut, kras],
                evidence: [publication],
                relevance: gof,
                subject: kras,
            },
            model: schema.Statement,
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

const tearDownDb = async ({ server, conf }) => {
    if (server) {
        await server.dropDatabase({
            name: conf.GKB_DB_NAME,
            password: conf.GKB_DBS_PASS,
            username: conf.GKB_DBS_USER,
        });
    }
};

export {
    clearDB, createEmptyDb, createSeededDb, tearDownDb,
};
