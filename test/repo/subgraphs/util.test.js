/* eslint-disable import/extensions */
const _ = require('lodash');

const {
    DEFAULT_EDGES,
    DEFAULT_PROPERTIES,
    DEFAULT_TREEEDGES,
} = require('../../../src/repo/subgraphs/constants');
const {
    buildTraverseExpr,
    formatToFlowchart,
    getAdjacency,
    getComponents,
    getGraph,
    getInheritingClasses,
    getPropsPerClass,
    oneliner,
} = require('../../../src/repo/subgraphs/util');

const {
    ADJACENCY,
    ADJACENCY_DIRECTED,
    COMPONENTS,
    EDGES,
    GRAPH,
    NODES,
    PROPS_PER_CLASS,
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
    const expectedParams = {
        t_edge0: 'A',
        t_edge1: 'B',
        t_treeEdge0: 'C',
        t_treeEdge1: 'D',
    };

    test('traverse expression for traversal query; no direction', () => {
        const result = buildTraverseExpr({ edges, prefix: 't_', treeEdges });
        const expected = `
            both(:t_edge0),bothE(:t_edge0),
            both(:t_edge1),bothE(:t_edge1)
        `;
        expect(result.expr).toBe(oneliner(expected, false));
        expect(result.params).toEqual(_.pick(expectedParams, ['t_edge0', 't_edge1']));
    });

    test('traverse expression for traversal query; ascending', () => {
        const result = buildTraverseExpr({
            direction: 'ascending',
            edges,
            treeEdges,
        });
        const expected = `
            both(:t_edge0),bothE(:t_edge0),
            both(:t_edge1),bothE(:t_edge1),
            out(:t_treeEdge0),outE(:t_treeEdge0),
            out(:t_treeEdge1),outE(:t_treeEdge1)
        `;
        expect(result.expr).toBe(oneliner(expected, false));
        expect(result.params).toEqual(expectedParams);
    });

    test('traverse expression for traversal query; descending', () => {
        const result = buildTraverseExpr({
            direction: 'descending',
            edges,
            treeEdges,
        });
        const expected = `
            both(:t_edge0),bothE(:t_edge0),
            both(:t_edge1),bothE(:t_edge1),
            in(:t_treeEdge0),inE(:t_treeEdge0),
            in(:t_treeEdge1),inE(:t_treeEdge1)
        `;
        expect(result.expr).toBe(oneliner(expected, false));
        expect(result.params).toEqual(expectedParams);
    });

    test('traverse expression for traversal query; without the edges', () => {
        const result = buildTraverseExpr({
            direction: 'descending',
            edges,
            treeEdges,
            withEdges: false,
        });
        const expected = `
            both(:t_edge0),
            both(:t_edge1),
            in(:t_treeEdge0),
            in(:t_treeEdge1)
        `;
        expect(result.expr).toBe(oneliner(expected, false));
        expect(result.params).toEqual(expectedParams);
    });
});

describe('getPropsPerClass', () => {
    test('return expected props on each class', () => {
        const result = getPropsPerClass(
            [
                ...DEFAULT_EDGES,
                ...DEFAULT_TREEEDGES,
                'Disease',
            ],
            DEFAULT_PROPERTIES,
        );
        expect(result).toEqual(PROPS_PER_CLASS);
    });
});

describe('getGraph', () => {
    test('format records into a graph object', () => {
        const graph = getGraph(RECORDS_MAP, { propsPerClass: PROPS_PER_CLASS });
        expect(graph.nodes).toEqual(NODES);
        expect(graph.edges).toEqual(EDGES);
        expect(graph).toEqual(GRAPH);
    });

    test('removes unwanted properties', () => {
        const propsPerClass = PROPS_PER_CLASS;
        propsPerClass.set('Disease', propsPerClass.get('Disease').filter((x) => x !== 'name'));

        const graph = getGraph(RECORDS_MAP, { propsPerClass });

        const r1 = [...graph.nodes.values()][0];
        const r1Props = Object.keys(r1);
        expect(r1Props.includes('name')).toBe(false);
        expect(r1Props.includes('source.sort')).toBe(true);
    });
});
