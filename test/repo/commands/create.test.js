const { create } = require('../../../src/repo/commands/create');
const {
    PermissionError, ValidationError,
} = require('../../../src/repo/error');
const { generateDefaultGroups } = require('../../../src/repo/schema');

const groups = generateDefaultGroups();

describe('create (createEdge)', () => {
    const db = {
        create: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
                to: jest.fn().mockReturnValue({
                    set: jest.fn().mockReturnValue({
                        one: jest.fn().mockResolvedValue(),
                    }),
                }),
            }),
        }),
        record: {
            get: jest.fn().mockResolvedValue([
                { '@class': 'Vocabulary' },
                { '@class': 'Vocabulary' },
            ]),
        },
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('throws permission error when user cannot create node types', async () => {
        await expect(create(db, {
            content: { '@class': 'SubClassOf', in: '#4:3', out: '#3:4' },
            modelName: 'SubClassOf',
            user: { '@rid': '#45:1', groups: groups.filter((g) => g.name === 'regular') },
        })).rejects.toBeInstanceOf(PermissionError);
    });

    test('throws error when user creates a loop', async () => {
        await expect(create(db, {
            content: { '@class': 'SubClassOf', in: '#3:4', out: '#3:4' },
            modelName: 'SubClassOf',
            user: { '@rid': '#45:1', groups: groups.filter((g) => g.name === 'admin') },
        })).rejects.toBeInstanceOf(ValidationError);
    });
});
