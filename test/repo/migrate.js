/**
 * Tests for the migration module
 */

const {
    migrate,
    requiresMigration,
} = require('../../app/repo/migrate');

jest.mock('../../app/repo/migrate/version');
jest.mock('../../app/repo/model', () => ({
    Property: { create: jest.fn() },
    ClassModel: { create: jest.fn() },
}));

const { getCurrentVersion, getLoadVersion } = jest.requireActual('./../../app/repo/migrate/version');
const _version = require('../../app/repo/migrate/version');

describe('migrate', () => {
    let db,
        propertyMock,
        modelMock,
        createRecordMock;

    beforeAll(() => {
        createRecordMock = jest.fn();
        const queryMock = jest.fn().mockReturnValue({ all: jest.fn(), one: jest.fn() });
        db = {
            query: queryMock,
            command: queryMock,
            index: {
                create: jest.fn(),
            },
            class: {
                get: jest.fn().mockResolvedValue({
                    create: createRecordMock,
                }),
            },
        };
        const model = require('../../app/repo/model');  // eslint-disable-line
        propertyMock = model.Property.create;
        modelMock = model.ClassModel.create;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('getCurrentVersion', async () => {
        db.query.mockReturnValue({ all: jest.fn().mockResolvedValueOnce([{ version: '1.6.2' }]) });
        const version = await getCurrentVersion(db);
        expect(db.query).toHaveBeenCalledWith('SELECT * FROM SchemaHistory ORDER BY createdAt DESC LIMIT 1');
        expect(version).toEqual('1.6.2');
    });

    test('getLoadVersion', () => {
        const version = getLoadVersion();
        expect(version).toHaveProperty('version');
        expect(version.version).toEqual(expect.stringMatching(/^\d+\.\d+\.\d+$/));
    });

    describe('requiresMigration', () => {
        test('compatible versions do not require migration', () => {
            expect(requiresMigration('1.9.1', '1.9.2')).toBeFalsy();
        });

        test('minor version difference requires migration', () => {
            expect(requiresMigration('1.9.1', '1.10.1')).toBeTruthy();
        });

        test('major version difference requires migration', () => {
            expect(requiresMigration('1.9.1', '2.9.2')).toBeTruthy();
        });
    });

    describe('migrate', () => {
        test('1.6 to 1.7.0', async () => {
            _version.getCurrentVersion = jest.fn().mockResolvedValue('1.6.2');
            _version.getLoadVersion = jest.fn().mockReturnValue({ version: '1.7.0' });
            await migrate(db);
            expect(db.index.create).toHaveBeenCalledTimes(3);
            expect(propertyMock).not.toHaveBeenCalled();
            expect(modelMock).not.toHaveBeenCalled();
            expect(db.query).not.toHaveBeenCalled();
            expect(createRecordMock).toHaveBeenCalledTimes(1);
        });

        test('1.6 to 1.7.1', async () => {
            _version.getCurrentVersion = jest.fn().mockResolvedValue('1.6.2');
            _version.getLoadVersion = jest.fn().mockReturnValue({ version: '1.7.1' });
            await migrate(db);
            expect(db.index.create).toHaveBeenCalledTimes(3);
            expect(propertyMock).not.toHaveBeenCalled();
            expect(modelMock).not.toHaveBeenCalled();
            expect(db.query).not.toHaveBeenCalled();
            expect(createRecordMock).toHaveBeenCalledTimes(2);
        });

        test('1.7 to 1.8', async () => {
            _version.getCurrentVersion = jest.fn().mockResolvedValue('1.7.0');
            _version.getLoadVersion = jest.fn().mockReturnValue({ version: '1.8.0' });
            await migrate(db);
            expect(db.index.create).not.toHaveBeenCalled();
            expect(propertyMock).toHaveBeenCalledTimes(1);
            expect(modelMock).not.toHaveBeenCalled();
            expect(db.query).not.toHaveBeenCalled();
            expect(createRecordMock).toHaveBeenCalledTimes(1);
        });

        test('1.8 to 1.9', async () => {
            _version.getCurrentVersion = jest.fn().mockResolvedValue('1.8.0');
            _version.getLoadVersion = jest.fn().mockReturnValue({ version: '1.9.0' });
            await migrate(db);
            expect(db.query).toHaveBeenCalledTimes(20);
            expect(db.class.get).toHaveBeenCalledTimes(3);
            expect(propertyMock).toHaveBeenCalledTimes(4);
            expect(modelMock).toHaveBeenCalledTimes(1);
            expect(createRecordMock).toHaveBeenCalledTimes(1);
        });

        test('compatible no migration', async () => {
            _version.getCurrentVersion = jest.fn().mockResolvedValue('1.8.0');
            _version.getLoadVersion = jest.fn().mockReturnValue({ version: '1.8.1' });
            await migrate(db);
            expect(db.query).not.toHaveBeenCalled();
            expect(db.class.get).not.toHaveBeenCalled();
        });

        test('error on no transition', () => {
            _version.getCurrentVersion = jest.fn().mockResolvedValue('1.6.0');
            _version.getLoadVersion = jest.fn().mockReturnValue({ version: '1.8.1' });
            expect(migrate(db)).rejects.toContain('Unable to find migration scripts');
            expect(db.query).not.toHaveBeenCalled();
            expect(db.class.get).not.toHaveBeenCalled();
        });

        test('incompatible check only', async () => {
            _version.getCurrentVersion = jest.fn().mockResolvedValue('1.8.0');
            _version.getLoadVersion = jest.fn().mockReturnValue({ version: '1.9.1' });
            expect(migrate(db, { checkOnly: true })).rejects.toContain('are not compatible');
            expect(db.query).not.toHaveBeenCalled();
            expect(db.class.get).not.toHaveBeenCalled();
        });

        test('1.6 to 1.9', async () => {
            _version.getCurrentVersion = jest.fn().mockResolvedValue('1.6.2');
            _version.getLoadVersion = jest.fn().mockReturnValue({ version: '1.9.2' });
            await migrate(db);
            expect(createRecordMock).toHaveBeenCalledTimes(4); // logged 4 times
            expect(db.query).toHaveBeenCalledTimes(20); // 1.8 to 1.9
            expect(db.index.create).toHaveBeenCalledTimes(3); // 1.6 to 1.7
            expect(propertyMock).toHaveBeenCalledTimes(5); // mixed
        });
    });
});
