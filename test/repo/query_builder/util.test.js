const { hasSeparatorChars, splitIntoKeywords } = require('../../../src/repo/query_builder/util');

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

describe('splitIntoKeywords', () => {
    test.each([
        ['abcdef', 1], // control
        ['abc def', 2],
        ['abc:def', 2],
        ['abc;def', 2],
        ['abc,def', 2],
        ['abc.def', 2],
        ['abc|def', 2],
        ['abc+def', 2],
        ['abc*def', 2],
        ['abc/def', 2],
        ['abc=def', 2],
        ['abc!def', 2],
        ['abc?def', 2],
        ['abc[def', 2],
        ['abc]def', 2],
        ['abc(def', 2],
        ['abc)def', 2],
        ['abc\u005Cdef', 2],
        ['abc\\def', 2],
    ])('splitIntoKeywords(%s) === %s', (kw, expected) => {
        expect(splitIntoKeywords(kw).length).toBe(expected);
    });

    test.each([
        ['Abc', ['abc']], // lowercase
        [' abc ', ['abc']], // trimmed
    ])('splitIntoKeywords(%s) === %s', (kw, expected) => {
        expect(splitIntoKeywords(kw).length).toBe(1);
        expect(splitIntoKeywords(kw)[0]).toBe(expected[0]);
    });
});
