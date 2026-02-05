const { hasSeperatorChars } = require('../../../src/repo/query_builder/util');

describe('hasSeperatorChars', () => {
    test.each([
        ['abc def', false], // control
        ['abc:def', true],
        ['abc;def', true],
        ['abc,def', true],
        ['abc.def', true],
        ['abc|def', true],
        ['abc+def', true],
        ['abc*def', true],
        ['abc/def', true],
        ['abc=def', true],
        ['abc!def', true],
        ['abc?def', true],
        ['abc[def', true],
        ['abc]def', true],
        ['abc(def', true],
        ['abc)def', true],
        ['abc\u005Cdef', true],
        ['abc\\def', true],
    ])('hasSeperatorChars(%s) === %s', (kw, expected) => {
        expect(hasSeperatorChars(kw)).toBe(expected);
    });
});
