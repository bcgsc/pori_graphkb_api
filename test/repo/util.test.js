const {
    groupRecordsBy,
    normalizeEvidenceLevel,
    trimRecords,
} = require('../../src/repo/util');

describe('groupRecordsBy', () => {
    test('groups single level', () => {
        const records = [
            { city: 'van', name: 'bob' },
            { city: 'van', name: 'alice' },
            { city: 'monkeys', name: 'blargh' },
        ];
        expect(groupRecordsBy(records, ['city'], { value: 'name' })).toEqual({
            monkeys: ['blargh'],
            van: ['bob', 'alice'],
        });
    });

    test('error on no aggregate and non-unique grouping', () => {
        const records = [
            { city: 'van', name: 'bob' },
            { city: 'van', name: 'alice' },
            { city: 'monkeys', name: 'blargh' },
        ];
        expect(() => {
            groupRecordsBy(records, ['city'], { aggregate: false, value: 'name' });
        }).toThrow('non-unique grouping');
    });

    test('uses the whole record when nestedProperty is null', () => {
        const records = [
            { city: 'van', name: 'bob' },
            { city: 'van', name: 'alice' },
            { city: 'monkeys', name: 'blargh' },
        ];
        expect(groupRecordsBy(records, ['city'])).toEqual({
            monkeys: [{ city: 'monkeys', name: 'blargh' }],
            van: [{ city: 'van', name: 'bob' }, { city: 'van', name: 'alice' }],
        });
    });

    test('groups 2+ levels', () => {
        const records = [
            { city: 'van', country: 'canada', name: 'bob' },
            { city: 'van', country: 'canada', name: 'alice' },
            { city: 'monkeys', country: 'narnia', name: 'blargh' },
        ];
        expect(groupRecordsBy(records, ['country', 'city'], { value: 'name' })).toEqual({
            canada: { van: ['bob', 'alice'] },
            narnia: { monkeys: ['blargh'] },
        });
    });

    test('no aggregate', () => {
        const records = [
            { city: 'van', country: 'canada', name: 'bob' },
            { city: 'van', country: 'mordor', name: 'alice' },
            { city: 'monkeys', country: 'narnia', name: 'blargh' },
        ];
        expect(groupRecordsBy(records, ['country', 'city'], { aggregate: false, value: 'name' })).toEqual({
            canada: { van: 'bob' },
            mordor: { van: 'alice' },
            narnia: { monkeys: 'blargh' },
        });
    });
});

describe('trimRecords', () => {
    test('removes protected records (default ok)', async () => {
        const records = [
            { name: 'bob' },
            { link: { '@rid': '#44:0', name: 'george' }, name: 'alice' },
        ];
        const trimmed = await trimRecords(records, { history: true, user: { groups: [{ '@rid': '#1:0' }] } });
        expect(trimmed).toEqual(records);
    });

    test('removes protected records (explicit group)', async () => {
        const records = [
            { groupRestrictions: [{ '@rid': '#2:0' }], name: 'bob' },
            { groupRestrictions: [{ '@rid': '#1:0' }], name: 'alice' },
        ];
        const trimmed = await trimRecords(records, { history: true, user: { groups: [{ '@rid': '#1:0' }] } });
        expect(trimmed).toEqual([{ groupRestrictions: [{ '@rid': '#1:0' }], name: 'alice' }]);
    });

    test('removes protected edges (default ok)', async () => {
        const records = [
            { groupRestrictions: [{ '@rid': '#1:0' }], name: 'bob' },
            {
                groupRestrictions: [{ '@rid': '#1:0' }],
                name: 'alice',
                out_link: { '@rid': '44:1', groupRestrictions: [{ '@rid': '#2:2' }] },
            },
        ];
        const trimmed = await trimRecords(records, { history: true, user: { groups: [{ '@rid': '#1:0' }] } });
        expect(trimmed).toEqual([
            { groupRestrictions: [{ '@rid': '#1:0' }], name: 'bob' },
            { groupRestrictions: [{ '@rid': '#1:0' }], name: 'alice' },
        ]);
    });

    test('removes protected edges (explicit group)', async () => {
        const records = [
            { groupRestrictions: [{ '@rid': '#1:0' }], name: 'bob' },
            { groupRestrictions: [{ '@rid': '#1:0' }], name: 'alice', out_link: { '@rid': '44:1', groupRestrictions: [{ '@rid': '#2:0' }] } },
        ];
        const trimmed = await trimRecords(records, { history: true, user: { groups: [{ '@rid': '#1:0' }] } });
        expect(trimmed).toEqual([
            { groupRestrictions: [{ '@rid': '#1:0' }], name: 'bob' },
            { groupRestrictions: [{ '@rid': '#1:0' }], name: 'alice' },
        ]);
    });

    test('allows protected edges (explicit group)', async () => {
        const records = [
            { groupRestrictions: [{ '@rid': '#1:0' }], name: 'bob' },
            {
                groupRestrictions: [{ '@rid': '#1:0' }],
                name: 'alice',
                out_edgeType: [
                    { '@rid': '44:1', groupRestrictions: [{ '@rid': '#2:0' }] },
                ],
            },
        ];
        const trimmed = await trimRecords(records, { history: true, user: { groups: [{ '@rid': '#1:0' }, { '@rid': '#2:0' }] } });
        expect(trimmed).toEqual([
            { groupRestrictions: [{ '@rid': '#1:0' }], name: 'bob' },
            {
                groupRestrictions: [{ '@rid': '#1:0' }],
                name: 'alice',
                out_edgeType: [
                    { '@rid': '44:1', groupRestrictions: [{ '@rid': '#2:0' }] },
                ],
            },
        ]);
    });

    test('removes nested protected records', async () => {
        const records = [
            { name: 'bob' },
            { groupRestrictions: [{ '@rid': '#2:1' }], link: { '@rid': '#44:1', groupRestrictions: [{ '@rid': '#55:5' }], name: 'george' }, name: 'alice' },
        ];
        const trimmed = await trimRecords(records, { user: { groups: [{ '@rid': '#2:1' }] } });
        expect(trimmed).toEqual([
            { name: 'bob' },
            { groupRestrictions: [{ '@rid': '#2:1' }], name: 'alice' },
        ]);
    });
});

describe('normalizeEvidenceLevel', () => {
    test.each([
        ['CGI Case report', 'C'],
        ['CGI Early trials', 'B'],
        ['CGI European LeukemiaNet guidelines', 'A'],
        ['CGI FDA guidelines', 'A'],
        ['CGI Late trials', 'B'],
        ['CGI NCCN guidelines', 'A'],
        ['CGI NCCN/CAP guidelines', 'A'],
        ['CGI Pre-clinical', 'D'],
        ['CIViC A1', 'A'],
        ['CIViC A2', 'A'],
        ['CIViC A3', 'A'],
        ['CIViC A4', 'A'],
        ['CIViC A5', 'A'],
        ['CIViC B', 'B'],
        ['CIViC B1', 'B'],
        ['CIViC B2', 'B'],
        ['CIViC B3', 'B'],
        ['CIViC B4', 'B'],
        ['CIViC B5', 'B'],
        ['CIViC C', 'C'],
        ['CIViC C1', 'C'],
        ['CIViC C2', 'C'],
        ['CIViC C3', 'C'],
        ['CIViC C4', 'C'],
        ['CIViC C5', 'C'],
        ['CIViC D', 'D'],
        ['CIViC D1', 'D'],
        ['CIViC D2', 'D'],
        ['CIViC D3', 'D'],
        ['CIViC D4', 'D'],
        ['CIViC D5', 'D'],
        ['CIViC DSWGW', 'D'],
        ['CIViC E1', 'E'],
        ['CIViC E2', 'E'],
        ['CIViC E3', 'E'],
        ['CIViC E4', 'E'],
        ['CIViC E5', 'E'],
        ['IPR-A', 'A'],
        ['IPR-B', 'B'],
        ['IPR-C', 'C'],
        ['IPR-D', 'D'],
        ['IPR-E', 'E'],
        ['Clinical evidence (MOA)', 'B'],
        ['MOAlmanac Clinical trial', 'B'],
        ['MOAlmanac FDA-Approved', 'A'],
        ['MOAlmanac Guideline', 'A'],
        ['MOAlmanac Inferential', 'E'],
        ['MOAlmanac Preclinical', 'D'],
        ['OncoKB 1', 'A'],
        ['OncoKB 2A', 'A'],
        ['OncoKB 2B', 'A'],
        ['OncoKB 3A', 'B'],
        ['OncoKB 3B', 'B'],
        ['OncoKB 4', 'D'],
        ['OncoKB R1', 'A'],
        ['OncoKB R2', 'B'],
        ['PROFYLE D1', 'A'],
        ['PROFYLE D2', 'B'],
        ['PROFYLE D3', 'C'],
        ['PROFYLE D4', 'D'],
        ['PROFYLE P1', 'A'],
        ['PROFYLE P2', 'B'],
        ['PROFYLE P3', 'C'],
        ['PROFYLE P4', 'D'],
        ['PROFYLE T1', 'A'],
        ['PROFYLE T2', 'B'],
        ['PROFYLE T3', 'C'],
        ['PROFYLE T4', 'D'],
        ['PROFYLE T5', 'E'],
        // Not implemented; expecting NA
        ['AMP Level A (Tier I)', 'NA'],
        ['AMP Level B (Tier II)', 'NA'],
        ['AMP Level C (Tier II)', 'NA'],
        ['AMP Level D (Tier II)', 'NA'],
        ['tier iii (variant of unknown clinical significance)', 'NA'],
        ['tier iv (benign or likely benign variants)', 'NA'],
        ['CGI CPIC guidelines', 'NA'],
        ['COSMIC-1', 'NA'],
        ['COSMIC-2', 'NA'],
        ['COSMIC-3', 'NA'],
        ['COSMIC-4', 'NA'],
        ['COSMIC-6', 'NA'],
        ['COSMIC-7', 'NA'],
        ['cpic limited', 'NA'],
        ['cpic moderate', 'NA'],
        ['cpic strong', 'NA'],
        // Erroneous displayName for test; expecting NA
        ['PROFYLE T9', 'NA'],
        ['OncoKB 7', 'NA'],
        ['Clinical evidence (MOA) v2', 'NA'],
        ['IPR-F', 'NA'],
        ['CIViC F1', 'NA'],
        ['displayName', 'NA'],
    ])('Normalize EvidenceLevel from %s to %s', (displayName, expected) => {
        const normalized = normalizeEvidenceLevel(displayName);
        expect(normalized).toEqual(expected);
    });
});
