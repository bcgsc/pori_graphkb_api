
const {
    schema: {
        schema: {
            SubClassOf,
        },
    },
} = require('@bcgsc/knowledgebase-schema');

const {
    PermissionError, AttributeError,
} = require('../../../src/repo/error');
const { create } = require('../../../src/repo/commands/create');
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
        try {
            await create(db, {
                content: { '@class': 'SubClassOf', in: '#4:3', out: '#3:4' },
                model: SubClassOf,
                user: { '@rid': '#45:1', groups: groups.filter(g => g.name === 'regular') },
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
                content: { '@class': 'SubClassOf', in: '#3:4', out: '#3:4' },
                model: SubClassOf,
                user: { '@rid': '#45:1', groups: groups.filter(g => g.name === 'admin') },
            });
        } catch (err) {
            expect(err).toBeInstanceOf(AttributeError);
            return;
        }
        throw new Error('Did not throw expected error');
    });
});
