import gkbSchema from '@bcgsc-pori/graphkb-schema';
const {
    schema: {
        schema: {
            SubClassOf,
        },
    },
} = gkbSchema;

import { modifyEdgeTx } from '../../../src/repo/commands/update';
import { PermissionError } from '../../../src/repo/error';
import { generateDefaultGroups } from '../../../src/repo/schema';

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
                changes: null,
                model: SubClassOf,
                original: { '@class': 'SubClassOf', in: '#4:3', out: '#3:4' },
                user: { '@rid': '#45:1', groups: groups.filter((g) => g.name === 'regular') },
            });
        } catch (err) {
            expect(err).toBeInstanceOf(PermissionError);
            expect(err.toString()).toContain('user has insufficient permissions to delete edges');
            return;
        }
        throw new Error('Did not throw expected error');
    });
});