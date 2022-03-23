const {
    hasRecordAccess,
} = require('../../../src/orm/commands/util');

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
