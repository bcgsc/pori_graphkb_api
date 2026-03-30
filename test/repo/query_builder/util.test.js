const { hasSeparatorChars } = require('../../../src/repo/query_builder/util');

describe('hasSeparatorChars', () => {
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
    ])('hasSeparatorChars(%s) === %s', (kw, expected) => {
        expect(hasSeparatorChars(kw)).toBe(expected);
    });
});
