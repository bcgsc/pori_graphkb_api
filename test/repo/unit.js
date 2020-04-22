

const {
    groupRecordsBy,
    trimRecords,
} = require('./../../src/repo/util');
const {
    hasRecordAccess,
} = require('./../../src/repo/commands/util');


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


describe('hasRecordAccess', () => {
    test('user with no groups', () => {
        const access = hasRecordAccess({ groups: [] }, { groupRestrictions: [{ '@rid': '#2:0' }] });
        expect(access).toBe(false);
    });

    test('record with no groups', () => {
        const access = hasRecordAccess({ groups: [] }, {});
        expect(access).toBe(true);
    });

    test('record with no groups but admin user', () => {
        const access = hasRecordAccess({ groups: [{ '@rid': '#2:0' }] }, {});
        expect(access).toBe(true);
    });

    test('record with different group', () => {
        const access = hasRecordAccess({ groups: [{ '@rid': '#3:0' }] }, { groupRestrictions: [{ '@rid': '#4:0' }] });
        expect(access).toBe(false);
    });

    test('record with different group and admin user', () => {
        const access = hasRecordAccess({ groups: [{ '@rid': '#2:0' }] }, { groupRestrictions: [{ '@rid': '#4:0' }] });
        expect(access).toBe(false);
    });

    test('record with the correct group', () => {
        const access = hasRecordAccess({ groups: [{ '@rid': '#2:0' }, { '@rid': '#4:0' }] }, { groupRestrictions: [{ '@rid': '#2:0' }] });
        expect(access).toBe(true);
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
