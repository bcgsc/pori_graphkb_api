const {
    createVirtualEdges,
    createVirtualNodes,
    getNodeToVNode,
    getPreferedRecord,
    getVNodeToNode,
    virtualize,
} = require('../../../src/repo/subgraphs/virtual');

const {
    GRAPH,
    NODE_TO_VNODE_MAP,
    VADJACENCY,
    VADJACENCY_NOSELFLOOP,
    VCOMPONENTS,
    VEDGES,
    VEDGES_INVERTED,
    VEDGES_NOSELFLOOP,
    VNODE_TO_NODE_MAP,
    VNODES,
} = require('./data');

describe('getPreferedRecord', () => {
    test('only one record', () => {
        expect(getPreferedRecord(
            ['#1:1'],
            GRAPH.nodes,
        )).toBe('#1:1');
    });

    test('based on source.sort only', () => {
        expect(getPreferedRecord(
            ['#1:1', '#1:2', '#1:3', '#1:5', '#1:6'],
            GRAPH.nodes,
        )).toBe('#1:2');
    });

    test('with deprecated records', () => {
        expect(getPreferedRecord(
            ['#1:1', '#1:2', '#1:3', '#1:5', '#1:6'],
            GRAPH.nodes,
            { deprecated: new Set(['#1:2']) },
        )).toBe('#1:3');
    });

    test('with aliasing and deprecated records', () => {
        expect(getPreferedRecord(
            ['#1:1', '#1:2', '#1:3', '#1:5', '#1:6'],
            GRAPH.nodes,
            { aliasing: new Set(['#1:2']), deprecated: new Set(['#1:3']) },
        )).toBe('#1:5');
    });

    test('aliasing over deprecated', () => {
        expect(getPreferedRecord(
            ['#1:3', '#1:4'],
            GRAPH.nodes,
            { aliasing: new Set(['#1:3']), deprecated: new Set(['#1:4']) },
        )).toBe('#1:3');
    });
});

describe('createVirtualNodes', () => {
    test('get all virtual nodes from a graph virtualization', () => {
        const result = createVirtualNodes(GRAPH);
        // number of virtual nodes
        expect(result.size).toEqual(VNODES.size);

        // each virtual node object
        result.forEach((value, key) => {
            expect(VNODES.has(key)).toBe(true);
            expect(value.records).toEqual(VNODES.get(key).records);
        });
    });
});

describe('getNodeToVNode', () => {
    test('get the mapping between nodes and virtual nodes', () => {
        const result = getNodeToVNode(VNODES);

        // number of keys
        expect(result.size).toEqual(NODE_TO_VNODE_MAP.size);

        // each key-value pair
        result.forEach((value, key) => {
            expect(value).toBe(NODE_TO_VNODE_MAP.get(key));
        });
    });
});

describe('getVNodeToNode', () => {
    test('get the mapping between virtual nodes and nodes', () => {
        const result = getVNodeToNode(VNODES);

        // number of keys
        expect(result.size).toEqual(VNODE_TO_NODE_MAP.size);

        // each key-value pair
        result.forEach((value, key) => {
            expect(value).toEqual(VNODE_TO_NODE_MAP.get(key));
        });
    });
});

describe('createVirtualEdges', () => {
    test('get all virtual edges from a graph virtualization', () => {
        const result = createVirtualEdges(GRAPH, NODE_TO_VNODE_MAP);

        // number of virtual nodes
        expect(result.size).toEqual(VEDGES.size);

        // each virtual node object
        result.forEach((value, key) => {
            expect(value).toEqual(VEDGES.get(key));
        });
    });
});

describe('virtualize', () => {
    test('get a virtual graph representation', () => {
        const result = virtualize(GRAPH);

        // serializable values
        expect(result).toEqual({
            adjacency: Object.fromEntries(VADJACENCY),
            components: VCOMPONENTS,
            edges: Object.fromEntries(VEDGES),
            g_to_v: Object.fromEntries(NODE_TO_VNODE_MAP),
            nodes: Object.fromEntries(VNODES),
            v_to_g: Object.fromEntries(VNODE_TO_NODE_MAP),
        });
    });

    test('get a virtual graph, without self loop', () => {
        const result = virtualize(GRAPH, { selfLoopAllowed: false });

        // serializable values
        expect(result).toEqual({
            adjacency: Object.fromEntries(VADJACENCY_NOSELFLOOP), // here
            components: VCOMPONENTS,
            edges: Object.fromEntries(VEDGES_NOSELFLOOP), // here
            g_to_v: Object.fromEntries(NODE_TO_VNODE_MAP),
            nodes: Object.fromEntries(VNODES),
            v_to_g: Object.fromEntries(VNODE_TO_NODE_MAP),
        });
    });

    test('get an inverted virtual graph', () => {
        const result = virtualize(GRAPH, { inverted: true });

        // serializable values
        expect(result).toEqual({
            adjacency: Object.fromEntries(VADJACENCY), // stay the same because the adjacency list is symetric
            components: VCOMPONENTS,
            edges: Object.fromEntries(VEDGES_INVERTED), // only difference
            g_to_v: Object.fromEntries(NODE_TO_VNODE_MAP),
            nodes: Object.fromEntries(VNODES),
            v_to_g: Object.fromEntries(VNODE_TO_NODE_MAP),
        });
    });
});
