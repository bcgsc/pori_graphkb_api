
const {
    schema: {
        schema: {
            SubClassOf,
        },
    },
} = require('@bcgsc/knowledgebase-schema');

const { create } = require('../../../src/repo/commands/create');
const {
    PermissionError, AttributeError,
} = require('../../../src/repo/error');
const { generateDefaultGroups } = require('../../../src/repo/schema');

const groups = generateDefaultGroups();


describe('create (createEdge)', () => {
    const db = {
        record: {
            get: jest.fn().mockResolvedValue([
                { '@class': 'Vocabulary' },
                { '@class': 'Vocabulary' },
            ]),
        },
        create: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
                to: jest.fn().mockReturnValue({
                    set: jest.fn().mockReturnValue({
                        one: jest.fn().mockResolvedValue(),
                    }),
                }),
            }),
        }),
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('throws permission error when user cannot create node types', async () => {
        try {
            await create(db, {
                content: { out: '#3:4', in: '#4:3', '@class': 'SubClassOf' },
                user: { groups: groups.filter(g => g.name === 'regular'), '@rid': '#45:1' },
                model: SubClassOf,
            });
        } catch (err) {
            expect(err).toBeInstanceOf(PermissionError);
            expect(err.toString()).toContain('user has insufficient permissions to link records');
            return;
        }
        throw new Error('Did not throw expected error');
    });

    test('throws error when user creates a loop', async () => {
        try {
            await create(db, {
                content: { out: '#3:4', in: '#3:4', '@class': 'SubClassOf' },
                user: { groups: groups.filter(g => g.name === 'admin'), '@rid': '#45:1' },
                model: SubClassOf,
            });
        } catch (err) {
            expect(err).toBeInstanceOf(AttributeError);
            return;
        }
        throw new Error('Did not throw expected error');
    });
});
