
const {
    schema: {
        schema,
    },
} = require('@bcgsc/knowledgebase-schema');

const { fetchDisplayName } = require('../../../src/repo/commands/select');


describe('fetchDisplayName', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test.todo('create regular');

    test('create category variant', async () => {
        const db = {
            query: jest.fn().mockReturnValue({
                all: jest.fn().mockResolvedValue([
                    { displayName: 'mksgkj', shortName: '>' },
                    { displayName: 'KRAS' },
                ]),
            }),
        };

        const content = {
            reference1: '1:1',
            type: '2:1',
        };
        const displayName = await fetchDisplayName(db, schema.CategoryVariant, content);
        expect(displayName).toEqual('KRAS mksgkj');
    });

    test('create fusion category variant', async () => {
        const db = {
            query: jest.fn().mockReturnValue({
                all: jest.fn().mockResolvedValue([
                    { displayName: 'fusion', shortName: '>' },
                    { displayName: 'EWSR1' },
                    { displayName: 'FLI1' },
                ]),
            }),
        };

        const content = {
            reference1: '1:1',
            reference2: '2:3',
            type: '2:1',
        };
        const displayName = await fetchDisplayName(db, schema.CategoryVariant, content);
        expect(displayName).toEqual('EWSR1 and FLI1 fusion');
    });

    test.todo('create statement template');

    test('create protein substitution using explicit hgvsType', async () => {
        const db = {
            query: jest.fn().mockReturnValue({
                all: jest.fn().mockResolvedValue([
                    { displayName: 'mksgkj', shortName: '>' },
                    { displayName: 'KRAS' },
                ]),
            }),
        };

        const content = {
            break1Repr: 'p.G12',
            break1Start: {
                '@class': 'ProteinPosition',
                pos: 12,
                refAA: 'G',
            },
            hgvsType: '>',
            reference1: '1:1',
            type: '2:1',
            untemplatedSeq: 'D',
        };
        const displayName = await fetchDisplayName(db, schema.PositionalVariant, content);
        expect(displayName).toEqual('KRAS:p.G12D');
    });

    test('create positional variant using vocabulary shortName', async () => {
        const db = {
            query: jest.fn().mockReturnValue({
                all: jest.fn().mockResolvedValue([
                    { displayName: 'mksgkj', shortName: '>' },
                    { displayName: 'KRAS' },
                ]),
            }),
        };

        const content = {
            break1Repr: 'p.G12',
            break1Start: {
                '@class': 'ProteinPosition',
                pos: 12,
                refAA: 'G',
            },
            reference1: '1:1',
            type: '2:1',
            untemplatedSeq: 'D',
        };
        const displayName = await fetchDisplayName(db, schema.PositionalVariant, content);
        expect(displayName).toEqual('KRAS:p.G12D');
    });

    test('create positional variant truncation', async () => {
        const db = {
            query: jest.fn().mockReturnValue({
                all: jest.fn().mockResolvedValue([
                    { displayName: 'truncation', shortName: '>' },
                    { displayName: 'KRAS' },
                ]),
            }),
        };

        const content = {
            break1Repr: 'p.G12',
            break1Start: {
                '@class': 'ProteinPosition',
                pos: 12,
                refAA: 'G',
            },
            reference1: '1:1',
            type: '2:1',
            untemplatedSeq: '*',
        };
        const displayName = await fetchDisplayName(db, schema.PositionalVariant, content);
        expect(displayName).toEqual('KRAS:p.G12*');
    });

    test('create positional variant using vocabulary name', async () => {
        const db = {
            query: jest.fn().mockReturnValue({
                all: jest.fn().mockResolvedValue([
                    { displayName: 'substitution' },
                    { displayName: 'KRAS' },
                ]),
            }),
        };

        const content = {
            break1Repr: 'p.G12D',
            break1Start: {
                '@class': 'ProteinPosition',
                pos: 12,
                refAA: 'G',
            },
            reference1: '1:1',
            type: '2:1',
        };
        const displayName = await fetchDisplayName(db, schema.PositionalVariant, content);
        expect(displayName).toEqual('KRAS:p.G12D');
    });
});
