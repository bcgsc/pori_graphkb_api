
const {
    schema: {
        schema: {
            SubClassOf,
        },
    },
} = require('@bcgsc/knowledgebase-schema');

const { modifyEdgeTx } = require('../../../src/repo/commands/update');
const {
    PermissionError,
} = require('../../../src/repo/error');
const { generateDefaultGroups } = require('../../../src/repo/schema');


const groups = generateDefaultGroups();


describe('remove (delete edge)', () => {
    const db = {
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

    test('throws permission error when user cannot delete node types', async () => {
        try {
            await modifyEdgeTx(db, {
                original: { out: '#3:4', in: '#4:3', '@class': 'SubClassOf' },
                changes: null,
                user: { groups: groups.filter(g => g.name === 'regular'), '@rid': '#45:1' },
                model: SubClassOf,
            });
        } catch (err) {
            expect(err).toBeInstanceOf(PermissionError);
            expect(err.toString()).toContain('user has insufficient permissions to delete edges');
            return;
        }
        throw new Error('Did not throw expected error');
    });
});
