// Mocks
jest.mock('../../../src/repo/commands', () => ({
    create: jest.fn(),
    select: jest.fn(),
}));

jest.mock('../../../src/repo/query_builder/index', () => ({
    parse: jest.fn((query) => query),
}));

jest.mock('../../../src/repo/error', () => ({
    NotImplementedError: class NotImplementedError extends Error {
        constructor(obj) {
            super(obj.message);
            this.name = 'ValidationError';
        }
    },
    RecordConflictError: class RecordConflictError extends Error {
        constructor(obj) {
            super(obj.message);
            this.name = 'RecordConflictError';
        }
    },
    ValidationError: class ValidationError extends Error {
        constructor(obj) {
            super(obj.message);
            this.name = 'ValidationError';
        }
    },
}));

// Dependencies
const { create, select } = require('../../../src/repo/commands');
const { parse } = require('../../../src/repo/query_builder/index');
const {
    NotImplementedError,
    RecordConflictError,
    ValidationError,
} = require('../../../src/repo/error');
const {
    formatReferenceDisplayName,
    getContent,
    getReference,
    getType,
    positionalVariantQueryFilters,
    uploadPositionalVariant,
} = require('../../../src/repo/upload/positionalvariant');

// Tests
describe('formatReferenceDisplayName', () => {
    test.each([
        // chromosomes
        ['1', 'chr1'],
        ['12', 'chr12'],
        ['chr2', 'chr2'],
        ['CHR23', 'chr23'],
        ['mt', 'mt'],
        ['X', 'x'],
        ['chry', 'y'],
        ['CHRY', 'y'],
        ['NC_000012', 'chr12'],
        ['NC_000012.3', 'chr12'],
        // others; all caps
        ['brca2', 'BRCA2'],
        ['TP53', 'TP53'],
        ['nm_12345.1', 'NM_12345.1'],
    ])('%s -> %s', (ref, formatted) => {
        expect(formatReferenceDisplayName(ref)).toBe(formatted);
    });
});

describe('getType', () => {
    const session = {};

    beforeEach(() => {
        select.mockResolvedValue([{ '@rid': '#123:45' }]);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('type is formatted to lowercase', async () => {
        await getType(session, 'Substitution');
        expect(parse).toHaveBeenCalledWith(expect.objectContaining({
            filters: { name: 'substitution' },
        }));
    });

    test('returns RID when vocabulary is found', async () => {
        await expect(getType(session, 'substitution')).resolves.toBe('#123:45');
    });

    test('throws NotImplementedError when vocabulary is not found', async () => {
        select.mockResolvedValue([]);

        await expect(getType(session, 'unknown')).rejects.toBeInstanceOf(NotImplementedError);
    });
});

describe('getReference', () => {
    const session = {};

    beforeEach(() => {
        jest.clearAllMocks();
        select.mockResolvedValue([
            { '@rid': '#123:45', source: { name: 'hgnc' } },
            { '@rid': '#123:46', source: { name: 'entrez gene' } },
        ]);
    });

    test('normalizes chromosome notation before querying', async () => {
        await getReference(session, '12');
        expect(parse).toHaveBeenCalledWith(expect.objectContaining({
            filters: { displayName: 'chr12' },
        }));
    });

    test('returns first RID when there is no preferedRefSrcName provided', async () => {
        await expect(getReference(session, 'BRCA2', {})).resolves.toBe('#123:45');
    });

    test('uses preferred source if preferedRefSrcName is provided', async () => {
        await expect(getReference(session, 'BRCA2', { preferedRefSrcName: 'entrez gene' })).resolves.toBe('#123:46');
    });

    test('throws NotImplementedError when no feature is found', async () => {
        select.mockResolvedValue([]);

        await expect(getReference(session, 'BRCA2', {})).rejects.toBeInstanceOf(NotImplementedError);
    });
});

describe('getContent', () => {
    const session = {};

    beforeEach(() => {
        jest.clearAllMocks();
        select
            .mockResolvedValueOnce([{ '@rid': '#123:45' }]) // getType()
            .mockResolvedValueOnce([{ '@rid': '#123:46', source: { name: 'hgnc' } }]) // getReference()
            .mockResolvedValueOnce([{ '@rid': '#123:47', source: { name: 'hgnc' } }]); // getReference()
    });

    test('throws ValidationError when notation is empty string', async () => {
        await expect(getContent(session, '')).rejects.toBeInstanceOf(ValidationError);
    });

    test('parses notation and replaces type and references with an RID', async () => {
        const result = await getContent(session, 'TP53:p.1_23::BRCA2:p.4_56');
        expect(result.type).toBe('#123:45');
        expect(result.reference1).toBe('#123:46');
        expect(result.reference2).toBe('#123:47');
    });
});

describe('positionalVariantQueryFilters', () => {
    test('only selected props as key-value pairs', () => {
        expect(positionalVariantQueryFilters({
            break1Repr: 'c.123',
            break1Start: {
                '@class': 'CdsPosition',
                pos: 123,
                prefix: 'c',
                offset: 0,
            }, // should be removed from query filter
            reference1: '#123:45',
            refSeq: 'C',
            type: '#123:46',
            untemplatedSeq: 'A',
        })).toEqual({
            AND: [
                { break1Repr: 'c.123' },
                { reference1: '#123:45' },
                { refSeq: 'C' },
                { type: '#123:46' },
                { untemplatedSeq: 'A' },
            ],
        });
    });
});

describe('uploadPositionalVariant', () => {
    const session = {};
    const user = { };

    beforeEach(() => {
        create.mockReset();
        select.mockReset();
    });

    test('create new record, no RID lookup needed', async () => {
        create.mockResolvedValue({ '@rid': '#21:1' });

        const content = {
            reference1: '#20:2',
            reference2: '#20:3',
            type: '#20:1',
        };

        await expect(
            uploadPositionalVariant(
                session,
                user,
                content,
            ),
        ).resolves.toEqual([{ '@rid': '#21:1' }, 'CREATED']);
        expect(create).toHaveBeenCalledWith(session, {
            content,
            modelName: 'PositionalVariant',
            user,
        });
        expect(select).not.toHaveBeenCalled();
    });

    test('conversion to RIDs and create new record', async () => {
        create.mockResolvedValue({ '@rid': '#21:1' });
        select
            .mockResolvedValueOnce([{ '@rid': '#20:1' }]) // getType()
            .mockResolvedValueOnce([{ '@rid': '#20:2', source: { name: 'hgnc' } }]) // getReference()
            .mockResolvedValueOnce([{ '@rid': '#20:3', source: { name: 'hgnc' } }]); // getReference()

        const content = {
            reference1: 'BRCA2',
            reference2: 'TP53',
            type: 'deletion',
        };

        await expect(
            uploadPositionalVariant(
                session,
                user,
                content,
            ),
        ).resolves.toEqual([{ '@rid': '#21:1' }, 'CREATED']);
        expect(create).toHaveBeenCalledWith(session, {
            content: {
                reference1: '#20:2',
                reference2: '#20:3',
                type: '#20:1',
            },
            modelName: 'PositionalVariant',
            user,
        });
    });

    test('returns existing record', async () => {
        create.mockRejectedValue(new RecordConflictError({}));
        select.mockResolvedValue([{ '@rid': '#21:1' }]);

        await expect(
            uploadPositionalVariant(
                session,
                user,
                {
                    reference1: '#20:2',
                    type: '#20:1',
                },
            ),
        ).resolves.toEqual([{ '@rid': '#21:1' }, 'OK']);
    });

    test('throws RecordConflictError when conflict', async () => {
        const conflict = new RecordConflictError({});
        create.mockRejectedValue(conflict);

        await expect(
            uploadPositionalVariant(
                session,
                user,
                {
                    reference1: '#20:2',
                    type: '#20:1',
                },
                { existsOk: false },
            ),
        ).rejects.toBe(conflict);
        expect(select).not.toHaveBeenCalled();
    });
});
