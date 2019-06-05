const {match: {neighborhood, descendants}, Comparison} = require('./../../../app/repo/query');

const {stripSQL} = require('./util');


describe('treeQuery', () => {
    test('custom edges', () => {
        const {query, params} = descendants({
            whereClause: new Comparison('name', 'blargh'),
            modelName: 'Disease',
            edges: ['AliasOf']
        });
        expect(stripSQL(query)).toBe(
            'SELECT * FROM (MATCH {class: Disease, WHERE: (name = :param0)}.out(\'AliasOf\'){WHILE: (out(\'AliasOf\').size() > 0 AND $depth < 50)} RETURN $pathElements)'
        );
        expect(params).toEqual({param0: 'blargh'});
    });
});


describe('neighborhood', () => {
    test('custom edges and depth', () => {
        const {query, params} = neighborhood({
            whereClause: new Comparison('name', 'blargh'),
            modelName: 'Disease',
            edges: ['AliasOf'],
            direction: 'both',
            depth: 1
        });
        expect(stripSQL(query)).toBe(
            'SELECT * FROM (MATCH {class: Disease, WHERE: (name = :param0)}.both(\'AliasOf\'){WHILE: ($depth < 1)} RETURN $pathElements)'
        );
        expect(params).toEqual({param0: 'blargh'});
    });
});
