/* eslint-disable import/extensions */
const {
    buildTraverseExpr,
    formatToFlowchart,
    getAdjacency,
    getComponents,
    getGraph,
    getInheritingClasses,
} = require('../../../src/repo/subgraphs/util');

const {
    ADJACENCY,
    ADJACENCY_DIRECTED,
    COMPONENTS,
    EDGES,
    GRAPH,
    NODES,
    RECORDS_MAP,
} = require('./data');

describe('getAdjacency', () => {
    test('undirected adjacency list', () => {
        const result = getAdjacency(GRAPH);
        expect(result).toEqual(ADJACENCY); // default to undirected
    });

    test('directed adjacency list', () => {
        const result = getAdjacency(GRAPH, { directed: true });
        expect(result).toEqual(ADJACENCY_DIRECTED);
    });
});

describe('getComponents', () => {
    test('disconnected components', () => {
        const result = getComponents(ADJACENCY);

        // number of components
        expect(result.length).toEqual(COMPONENTS.length);

        // each component array
        for (let i = 0; i < result.length; i++) {
            expect(result[i]).toEqual(COMPONENTS[i]);
            // expect(result[i].sort()).toEqual(COMPONENTS[i].sort());
        }
    });
});

describe('formatToFlowchart', () => {
    const nodes = {
        '#1:01': { label: 'A' },
        '#1:02': { name: 'B' },
        '#1:03': {},
    };
    const edges = {
        '#1:01-#1:02': { in: '#1:02', out: '#1:01' },
    };
    const flowchart = [
        'flowchart BT', // default to BT (Bottom-Top)
        '#1:01["A"]',
        '#1:02["B"]',
        '#1:03',
        '#1:01 --> #1:02',
    ];

    test('convert a graph into the Mermaid flowchart format; array', () => {
        const result = formatToFlowchart({
            edges,
            nodes,
            strignify: false,
        });
        expect(result).toEqual(flowchart);
    });

    test('convert a graph into the Mermaid flowchart format; string', () => {
        const result = formatToFlowchart({
            edges,
            nodes,
        });
        expect(result).toEqual(flowchart.join('\n'));
    });
});

describe('getInheritingClasses', () => {
    // Based on schema v4.0.0
    const concreteVerticeCls = [
        'Abstract',
        'AnatomicalEntity',
        'CatalogueVariant',
        'CategoryVariant',
        'ClinicalTrial',
        'CuratedContent',
        'Disease',
        'EvidenceLevel',
        'Feature',
        'Pathway',
        'PositionalVariant',
        'Publication',
        'Signature',
        'Source',
        'Statement',
        'Therapy',
        'Vocabulary',
    ];
    const VerticeCls = [...concreteVerticeCls, 'Ontology', 'Variant'];
    const VerticeClsInclV = [...VerticeCls, 'V'];

    test('getting inherited classes', () => {
        const result = getInheritingClasses('V');
        concreteVerticeCls.sort();
        expect(result).toEqual(concreteVerticeCls);
    });

    test('getting inherited classes, including abstract classes', () => {
        const result = getInheritingClasses('V', { includeAbstractCls: true });
        VerticeCls.sort();
        expect(result).toEqual(VerticeCls);
    });

    test('getting inherited classes, including the original super class', () => {
        const result = getInheritingClasses('V', {
            includeAbstractCls: true, // since V is also abstract
            includeSuperCls: true,
        });
        VerticeClsInclV.sort();
        expect(result).toEqual(VerticeClsInclV);
    });
});

describe('buildTraverseExpr', () => {
    const edges = ['A', 'B'];
    const treeEdges = ['C', 'D'];

    test('traverse expression for traversal query; no direction', () => {
        const result = buildTraverseExpr({ edges, treeEdges });
        const expected = `
            both('A'),bothE('A'),
            both('B'),bothE('B')
        `;
        expect(result).toBe(expected.replace(/\s+/g, ''));
    });

    test('traverse expression for traversal query; ascending', () => {
        const result = buildTraverseExpr({
            direction: 'ascending',
            edges,
            treeEdges,
        });
        const expected = `
            both('A'),bothE('A'),
            both('B'),bothE('B'),
            out('C'),outE('C'),
            out('D'),outE('D')
        `;
        expect(result).toBe(expected.replace(/\s+/g, ''));
    });

    test('traverse expression for traversal query; descending', () => {
        const result = buildTraverseExpr({
            direction: 'descending',
            edges,
            treeEdges,
        });
        const expected = `
            both('A'),bothE('A'),
            both('B'),bothE('B'),
            in('C'),inE('C'),
            in('D'),inE('D')
        `;
        expect(result).toBe(expected.replace(/\s+/g, ''));
    });

    test('traverse expression for traversal query; without the edges', () => {
        const result = buildTraverseExpr({
            direction: 'descending',
            edges,
            treeEdges,
            withEdges: false,
        });
        const expected = `
            both('A'),both('B'),
            in('C'),in('D')
        `;
        expect(result).toBe(expected.replace(/\s+/g, ''));
    });
});

describe('getGraph', () => {
    test('format records into a graph object', () => {
        const graph = getGraph(RECORDS_MAP);
        expect(graph.nodes).toEqual(NODES);
        expect(graph.edges).toEqual(EDGES);
        expect(graph).toEqual(GRAPH);
    });
});
