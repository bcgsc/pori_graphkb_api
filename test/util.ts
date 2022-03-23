import uuidV4 from 'uuid/v4';
import orientjs from 'orientjs';
import { getUserByName } from '../src/repo/commands';
import { connectDB } from '../src/repo';

const setUpEmptyDB = async (conf) => {
    conf.GKB_DB_NAME = `test_${uuidV4()}`;
    conf.GKB_DB_CREATE = true;
    conf.GKB_USER_CREATE = true;

    const { server, db, schema } = await connectDB({ ...conf, GKB_NEW_DB: true });

    const user = await getUserByName(db, process.env.USER || 'admin');

    return {
        admin: user, conf, db, dbName: conf.GKB_DB_NAME, schema, server,
    };
};

const clearDB = async (db: orientjs.Db, admin) => {
    // clear all V/E records
    await db.command('delete edge e').all();
    await db.command('delete vertex v').all();
    await db.command(`delete from user where name != '${admin.name}'`).all();
    await db.command('delete from usergroup where name != \'readonly\' and name != \'admin\' and name != \'regular\'').all();
};

export{ clearDB, setUpEmptyDB };
