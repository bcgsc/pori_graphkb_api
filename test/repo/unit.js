

const {
    groupRecordsBy,
    trimRecords
} = require('./../../app/repo/util');
const {
    hasRecordAccess
} = require('./../../app/repo/commands/util');


describe('groupRecordsBy', () => {
    test('groups single level', () => {
        const records = [
            {name: 'bob', city: 'van'},
            {name: 'alice', city: 'van'},
            {name: 'blargh', city: 'monkeys'}
        ];
        expect(groupRecordsBy(records, ['city'], {value: 'name'})).toEqual({
            van: ['bob', 'alice'],
            monkeys: ['blargh']
        });
    });
    test('error on no aggregate and non-unique grouping', () => {
        const records = [
            {name: 'bob', city: 'van'},
            {name: 'alice', city: 'van'},
            {name: 'blargh', city: 'monkeys'}
        ];
        expect(() => {
            groupRecordsBy(records, ['city'], {value: 'name', aggregate: false});
        }).toThrowError('non-unique grouping');
    });
    test('uses the whole record when nestedProperty is null', () => {
        const records = [
            {name: 'bob', city: 'van'},
            {name: 'alice', city: 'van'},
            {name: 'blargh', city: 'monkeys'}
        ];
        expect(groupRecordsBy(records, ['city'])).toEqual({
            van: [{name: 'bob', city: 'van'}, {name: 'alice', city: 'van'}],
            monkeys: [{name: 'blargh', city: 'monkeys'}]
        });
    });
    test('groups 2+ levels', () => {
        const records = [
            {name: 'bob', city: 'van', country: 'canada'},
            {name: 'alice', city: 'van', country: 'canada'},
            {name: 'blargh', city: 'monkeys', country: 'narnia'}
        ];
        expect(groupRecordsBy(records, ['country', 'city'], {value: 'name'})).toEqual({
            canada: {van: ['bob', 'alice']},
            narnia: {monkeys: ['blargh']}
        });
    });
    test('no aggregate', () => {
        const records = [
            {name: 'bob', city: 'van', country: 'canada'},
            {name: 'alice', city: 'van', country: 'mordor'},
            {name: 'blargh', city: 'monkeys', country: 'narnia'}
        ];
        expect(groupRecordsBy(records, ['country', 'city'], {value: 'name', aggregate: false})).toEqual({
            canada: {van: 'bob'},
            mordor: {van: 'alice'},
            narnia: {monkeys: 'blargh'}
        });
    });
});


describe('hasRecordAccess', () => {
    test('user with no groups', () => {
        const access = hasRecordAccess({groups: []}, {groupRestrictions: [{'@rid': '#2:0'}]});
        expect(access).toBe(false);
    });
    test('record with no groups', () => {
        const access = hasRecordAccess({groups: []}, {});
        expect(access).toBe(true);
    });
    test('record with no groups but admin user', () => {
        const access = hasRecordAccess({groups: [{'@rid': '#2:0'}]}, {});
        expect(access).toBe(true);
    });
    test('record with different group', () => {
        const access = hasRecordAccess({groups: [{'@rid': '#3:0'}]}, {groupRestrictions: [{'@rid': '#4:0'}]});
        expect(access).toBe(false);
    });
    test('record with different group and admin user', () => {
        const access = hasRecordAccess({groups: [{'@rid': '#2:0'}]}, {groupRestrictions: [{'@rid': '#4:0'}]});
        expect(access).toBe(false);
    });
    test('record with the correct group', () => {
        const access = hasRecordAccess({groups: [{'@rid': '#2:0'}, {'@rid': '#4:0'}]}, {groupRestrictions: [{'@rid': '#2:0'}]});
        expect(access).toBe(true);
    });
});


describe('trimRecords', () => {
    test('removes protected records (default ok)', async () => {
        const records = [
            {name: 'bob'},
            {name: 'alice', link: {name: 'george', '@rid': '#44:0'}}
        ];
        const trimmed = await trimRecords(records, {activeOnly: false, user: {groups: [{'@rid': '#1:0'}]}});
        expect(trimmed).toEqual(records);
    });
    test('removes protected records (explicit group)', async () => {
        const records = [
            {name: 'bob', groupRestrictions: [{'@rid': '#2:0'}]},
            {name: 'alice', groupRestrictions: [{'@rid': '#1:0'}]}
        ];
        const trimmed = await trimRecords(records, {activeOnly: false, user: {groups: [{'@rid': '#1:0'}]}});
        expect(trimmed).toEqual([{name: 'alice', groupRestrictions: [{'@rid': '#1:0'}]}]);
    });
    test('removes protected edges (default ok)', async () => {
        const records = [
            {name: 'bob', groupRestrictions: [{'@rid': '#1:0'}]},
            {
                name: 'alice',
                out_link: {'@rid': '44:1', groupRestrictions: [{'@rid': '#2:2'}]},
                groupRestrictions: [{'@rid': '#1:0'}]
            }
        ];
        const trimmed = await trimRecords(records, {activeOnly: false, user: {groups: [{'@rid': '#1:0'}]}});
        expect(trimmed).toEqual([
            {name: 'bob', groupRestrictions: [{'@rid': '#1:0'}]},
            {name: 'alice', groupRestrictions: [{'@rid': '#1:0'}]}
        ]);
    });
    test('removes protected edges (explicit group)', async () => {
        const records = [
            {name: 'bob', groupRestrictions: [{'@rid': '#1:0'}]},
            {name: 'alice', out_link: {'@rid': '44:1', groupRestrictions: [{'@rid': '#2:0'}]}, groupRestrictions: [{'@rid': '#1:0'}]}
        ];
        const trimmed = await trimRecords(records, {activeOnly: false, user: {groups: [{'@rid': '#1:0'}]}});
        expect(trimmed).toEqual([
            {name: 'bob', groupRestrictions: [{'@rid': '#1:0'}]},
            {name: 'alice', groupRestrictions: [{'@rid': '#1:0'}]}
        ]);
    });
    test('removes nested protected records', async () => {
        const records = [
            {name: 'bob'},
            {name: 'alice', link: {name: 'george', '@rid': '#44:1', groupRestrictions: [{'@rid': '#55:5'}]}, groupRestrictions: [{'@rid': '#2:1'}]}
        ];
        const trimmed = await trimRecords(records, {user: {groups: [{'@rid': '#2:1'}]}});
        expect(trimmed).toEqual([
            {name: 'bob'},
            {name: 'alice', groupRestrictions: [{'@rid': '#2:1'}]}
        ]);
    });
});
