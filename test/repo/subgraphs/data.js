/* eslint-disable sort-keys */
/* eslint-disable sort-keys-fix/sort-keys-fix */
/* eslint-disable object-curly-newline */

const { RID } = require('orientjs');

/**
 * SAMPLE GRAPH FOR TESTING SUBGRAPHS FUNCTIONALITIES
 */

// INITIAL RECORDS
const RIDs = new Map([
    ...Array.from({ length: 26 }, (_, i) => i + 1).map(
        (x) => [`#1:${x}`, new RID({ cluster: 1, position: x })],
    ),
    ...Array.from({ length: 11 }, (_, i) => i + 1).map(
        (x) => [`#2:${x}`, new RID({ cluster: 2, position: x })],
    ),
    ...Array.from({ length: 15 }, (_, i) => i + 1).map(
        (x) => [`#3:${x}`, new RID({ cluster: 3, position: x })],
    ),
]);
const RECORDS = [
    // NODES
    // 1st component
    { '@rid': RIDs.get('#1:1'), '@class': 'Disease', name: 'A', 'source.sort': null },
    { '@rid': RIDs.get('#1:2'), '@class': 'Disease', name: 'B', 'source.sort': 0 },
    { '@rid': RIDs.get('#1:3'), '@class': 'Disease', name: 'C', 'source.sort': 1 },
    { '@rid': RIDs.get('#1:4'), '@class': 'Disease', name: 'D', 'source.sort': 1 },
    { '@rid': RIDs.get('#1:5'), '@class': 'Disease', name: 'E', 'source.sort': 2 },
    { '@rid': RIDs.get('#1:6'), '@class': 'Disease', name: 'F', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:7'), '@class': 'Disease', name: 'G', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:8'), '@class': 'Disease', name: 'H', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:9'), '@class': 'Disease', name: 'I', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:10'), '@class': 'Disease', name: 'J', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:11'), '@class': 'Disease', name: 'K', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:12'), '@class': 'Disease', name: 'L', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:13'), '@class': 'Disease', name: 'M', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:14'), '@class': 'Disease', name: 'N', 'source.sort': 99999 },
    // 2nd component
    { '@rid': RIDs.get('#1:15'), '@class': 'Disease', name: 'O', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:16'), '@class': 'Disease', name: 'P', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:17'), '@class': 'Disease', name: 'Q', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:18'), '@class': 'Disease', name: 'R', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:19'), '@class': 'Disease', name: 'S', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:20'), '@class': 'Disease', name: 'T', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:21'), '@class': 'Disease', name: 'U', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:22'), '@class': 'Disease', name: 'V', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:23'), '@class': 'Disease', name: 'W', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:24'), '@class': 'Disease', name: 'X', 'source.sort': 99999 },
    // 3rd component
    { '@rid': RIDs.get('#1:25'), '@class': 'Disease', name: 'Y', 'source.sort': 99999 },
    { '@rid': RIDs.get('#1:26'), '@class': 'Disease', name: 'Z', 'source.sort': 99999 },
    // EDGES
    // Similarity edges
    { '@rid': RIDs.get('#2:1'), '@class': 'AliasOf', out: RIDs.get('#1:1'), in: RIDs.get('#1:2') }, // A -AliasOf-> B
    { '@rid': RIDs.get('#2:3'), '@class': 'AliasOf', out: RIDs.get('#1:6'), in: RIDs.get('#1:7') }, // F -AliasOf-> G
    { '@rid': RIDs.get('#2:6'), '@class': 'AliasOf', out: RIDs.get('#1:12'), in: RIDs.get('#1:11') }, // L -AliasOf-> K
    { '@rid': RIDs.get('#2:8'), '@class': 'AliasOf', out: RIDs.get('#1:19'), in: RIDs.get('#1:20') }, // S -AliasOf-> T
    { '@rid': RIDs.get('#2:10'), '@class': 'AliasOf', out: RIDs.get('#1:22'), in: RIDs.get('#1:23') }, // V -AliasOf-> W
    { '@rid': RIDs.get('#2:12'), '@class': 'AliasOf', out: RIDs.get('#1:25'), in: RIDs.get('#1:26') }, // Y -AliasOf-> Z
    { '@rid': RIDs.get('#2:4'), '@class': 'CrossReferenceOf', out: RIDs.get('#1:7'), in: RIDs.get('#1:8') }, // G -CrossReferenceOf-> H
    { '@rid': RIDs.get('#2:7'), '@class': 'CrossReferenceOf', out: RIDs.get('#1:16'), in: RIDs.get('#1:17') }, // P -CrossReferenceOf-> Q
    { '@rid': RIDs.get('#2:2'), '@class': 'DeprecatedBy', out: RIDs.get('#1:3'), in: RIDs.get('#1:2') }, // C -DeprecatedBy-> B
    { '@rid': RIDs.get('#2:5'), '@class': 'DeprecatedBy', out: RIDs.get('#1:9'), in: RIDs.get('#1:8') }, // I -DeprecatedBy-> H
    { '@rid': RIDs.get('#2:9'), '@class': 'DeprecatedBy', out: RIDs.get('#1:21'), in: RIDs.get('#1:20') }, // U -DeprecatedBy-> T
    { '@rid': RIDs.get('#2:11'), '@class': 'DeprecatedBy', out: RIDs.get('#1:23'), in: RIDs.get('#1:24') }, // W -DeprecatedBy-> X
    // Hierarchy edges
    { '@rid': RIDs.get('#3:1'), '@class': 'SubClassOf', out: RIDs.get('#1:3'), in: RIDs.get('#1:1') }, // C -SubClassOf-> A; will generate a self-referencing vNode
    { '@rid': RIDs.get('#3:2'), '@class': 'SubClassOf', out: RIDs.get('#1:7'), in: RIDs.get('#1:3') }, // G -SubClassOf-> C
    { '@rid': RIDs.get('#3:3'), '@class': 'SubClassOf', out: RIDs.get('#1:8'), in: RIDs.get('#1:4') }, // H -SubClassOf-> D
    { '@rid': RIDs.get('#3:4'), '@class': 'SubClassOf', out: RIDs.get('#1:8'), in: RIDs.get('#1:5') }, // H -SubClassOf-> E
    { '@rid': RIDs.get('#3:5'), '@class': 'SubClassOf', out: RIDs.get('#1:10'), in: RIDs.get('#1:7') }, // J -SubClassOf-> G
    { '@rid': RIDs.get('#3:6'), '@class': 'SubClassOf', out: RIDs.get('#1:11'), in: RIDs.get('#1:7') }, // K -SubClassOf-> G
    { '@rid': RIDs.get('#3:7'), '@class': 'SubClassOf', out: RIDs.get('#1:13'), in: RIDs.get('#1:12') }, // M -SubClassOf-> L
    { '@rid': RIDs.get('#3:8'), '@class': 'SubClassOf', out: RIDs.get('#1:14'), in: RIDs.get('#1:12') }, // N -SubClassOf-> L
    { '@rid': RIDs.get('#3:9'), '@class': 'SubClassOf', out: RIDs.get('#1:17'), in: RIDs.get('#1:15') }, // Q -SubClassOf-> O
    { '@rid': RIDs.get('#3:10'), '@class': 'SubClassOf', out: RIDs.get('#1:19'), in: RIDs.get('#1:17') }, // S -SubClassOf-> Q
    { '@rid': RIDs.get('#3:11'), '@class': 'SubClassOf', out: RIDs.get('#1:19'), in: RIDs.get('#1:18') }, // S -SubClassOf-> R
    { '@rid': RIDs.get('#3:12'), '@class': 'SubClassOf', out: RIDs.get('#1:20'), in: RIDs.get('#1:22') }, // T -SubClassOf-> V; cycle T -> V -> W -> T
    { '@rid': RIDs.get('#3:13'), '@class': 'SubClassOf', out: RIDs.get('#1:22'), in: RIDs.get('#1:23') }, // V -SubClassOf-> W; will generate a self-referencing vNode
    { '@rid': RIDs.get('#3:14'), '@class': 'SubClassOf', out: RIDs.get('#1:23'), in: RIDs.get('#1:20') }, // W -SubClassOf-> T
    { '@rid': RIDs.get('#3:15'), '@class': 'SubClassOf', out: RIDs.get('#1:24'), in: RIDs.get('#1:20') }, // X -SubClassOf-> T
];
const RECORDS_MAP = new Map(
    RECORDS.map((x) => [String(x['@rid']), x]),
);

// GRAPH
const NODES = new Map(
    RECORDS.slice(0, 26).map(
        (x) => [String(x['@rid']), x],
    ),
);
const EDGES = new Map(
    RECORDS.slice(26, 53).map(
        (x) => [String(x['@rid']), x],
    ),
);
const GRAPH = {
    edges: EDGES,
    nodes: NODES,
};
const ADJACENCY = new Map([
    ['#1:1', new Set(['#1:2', '#1:3'])],
    ['#1:10', new Set(['#1:7'])],
    ['#1:11', new Set(['#1:12', '#1:7'])],
    ['#1:12', new Set(['#1:11', '#1:13', '#1:14'])],
    ['#1:13', new Set(['#1:12'])],
    ['#1:14', new Set(['#1:12'])],
    ['#1:15', new Set(['#1:17'])],
    ['#1:16', new Set(['#1:17'])],
    ['#1:17', new Set(['#1:15', '#1:16', '#1:19'])],
    ['#1:18', new Set(['#1:19'])],
    ['#1:19', new Set(['#1:17', '#1:18', '#1:20'])],
    ['#1:2', new Set(['#1:1', '#1:3'])],
    ['#1:20', new Set(['#1:19', '#1:21', '#1:22', '#1:23', '#1:24'])],
    ['#1:21', new Set(['#1:20'])],
    ['#1:22', new Set(['#1:20', '#1:23'])],
    ['#1:23', new Set(['#1:20', '#1:22', '#1:24'])],
    ['#1:24', new Set(['#1:20', '#1:23'])],
    ['#1:25', new Set(['#1:26'])],
    ['#1:26', new Set(['#1:25'])],
    ['#1:3', new Set(['#1:1', '#1:2', '#1:7'])],
    ['#1:4', new Set(['#1:8'])],
    ['#1:5', new Set(['#1:8'])],
    ['#1:6', new Set(['#1:7'])],
    ['#1:7', new Set(['#1:10', '#1:11', '#1:3', '#1:6', '#1:8'])],
    ['#1:8', new Set(['#1:4', '#1:5', '#1:7', '#1:9'])],
    ['#1:9', new Set(['#1:8'])],
]);
const ADJACENCY_DIRECTED = new Map([
    ['#1:1', new Set(['#1:2'])],
    ['#1:10', new Set(['#1:7'])],
    ['#1:11', new Set(['#1:7'])],
    ['#1:12', new Set(['#1:11'])],
    ['#1:13', new Set(['#1:12'])],
    ['#1:14', new Set(['#1:12'])],
    ['#1:15', new Set()],
    ['#1:16', new Set(['#1:17'])],
    ['#1:17', new Set(['#1:15'])],
    ['#1:18', new Set()],
    ['#1:19', new Set(['#1:17', '#1:18', '#1:20'])],
    ['#1:2', new Set()],
    ['#1:20', new Set(['#1:22'])],
    ['#1:21', new Set(['#1:20'])],
    ['#1:22', new Set(['#1:23'])],
    ['#1:23', new Set(['#1:20', '#1:24'])],
    ['#1:24', new Set(['#1:20'])],
    ['#1:25', new Set(['#1:26'])],
    ['#1:26', new Set()],
    ['#1:3', new Set(['#1:1', '#1:2'])],
    ['#1:4', new Set()],
    ['#1:5', new Set()],
    ['#1:6', new Set(['#1:7'])],
    ['#1:7', new Set(['#1:3', '#1:8'])],
    ['#1:8', new Set(['#1:4', '#1:5'])],
    ['#1:9', new Set(['#1:8'])],
]);
const COMPONENTS = [
    RECORDS.slice(0, 14).map((x) => String(x['@rid'])),
    RECORDS.slice(14, 24).map((x) => String(x['@rid'])),
    RECORDS.slice(24, 26).map((x) => String(x['@rid'])),
];

// VIRTUALIZATION
const VNODES = new Map([
    // 1st component
    ['#1:2', { label: 'B', records: [NODES.get('#1:1'), NODES.get('#1:2'), NODES.get('#1:3')] }],
    ['#1:4', { label: 'D', records: [NODES.get('#1:4')] }],
    ['#1:5', { label: 'E', records: [NODES.get('#1:5')] }],
    ['#1:7', { label: 'G', records: [NODES.get('#1:6'), NODES.get('#1:7'), NODES.get('#1:8'), NODES.get('#1:9')] }],
    ['#1:10', { label: 'J', records: [NODES.get('#1:10')] }],
    ['#1:11', { label: 'K', records: [NODES.get('#1:11'), NODES.get('#1:12')] }],
    ['#1:13', { label: 'M', records: [NODES.get('#1:13')] }],
    ['#1:14', { label: 'N', records: [NODES.get('#1:14')] }],
    // 2nd component
    ['#1:15', { label: 'O', records: [NODES.get('#1:15')] }],
    ['#1:16', { label: 'P', records: [NODES.get('#1:16'), NODES.get('#1:17')] }],
    ['#1:18', { label: 'R', records: [NODES.get('#1:18')] }],
    ['#1:20', { label: 'T', records: [NODES.get('#1:19'), NODES.get('#1:20'), NODES.get('#1:21')] }],
    ['#1:24', { label: 'X', records: [NODES.get('#1:22'), NODES.get('#1:23'), NODES.get('#1:24')] }],
    // 3rd component
    ['#1:26', { label: 'Z', records: [NODES.get('#1:25'), NODES.get('#1:26')] }],
]);
const VNODE_TO_NODE_MAP = new Map(
    [...VNODES].map((x) => [
        x[0],
        x[1].records.map((r) => String(r['@rid'])),
    ]),
);
const NODE_TO_VNODE_MAP = new Map(
    [...VNODES].flatMap(
        ([k, { records }]) => records.map(
            (r) => [String(r['@rid']), k],
        ),
    ),
);
const VEDGES = new Map([
    ['#1:10-#1:7', { out: '#1:10', in: '#1:7' }],
    ['#1:11-#1:7', { out: '#1:11', in: '#1:7' }],
    ['#1:13-#1:11', { out: '#1:13', in: '#1:11' }],
    ['#1:14-#1:11', { out: '#1:14', in: '#1:11' }],
    ['#1:16-#1:15', { out: '#1:16', in: '#1:15' }],
    ['#1:2-#1:2', { out: '#1:2', in: '#1:2' }],
    ['#1:20-#1:16', { out: '#1:20', in: '#1:16' }],
    ['#1:20-#1:18', { out: '#1:20', in: '#1:18' }],
    ['#1:20-#1:24', { out: '#1:20', in: '#1:24' }],
    ['#1:24-#1:20', { out: '#1:24', in: '#1:20' }],
    ['#1:24-#1:24', { out: '#1:24', in: '#1:24' }],
    ['#1:7-#1:2', { out: '#1:7', in: '#1:2' }],
    ['#1:7-#1:4', { out: '#1:7', in: '#1:4' }],
    ['#1:7-#1:5', { out: '#1:7', in: '#1:5' }],
]);
const VEDGES_NOSELFLOOP = new Map(
    [...VEDGES].filter(([, v]) => v.in !== v.out),
);
const VEDGES_INVERTED = new Map(
    [...VEDGES].map((x) => [
        x[0].split('-').reverse().join('-'), // inverted id
        { out: x[1].in, in: x[1].out }, // inverted incomming/outgoing vnodes
    ]),
);
const VADJACENCY = new Map([
    ['#1:10', ['#1:7']],
    ['#1:11', ['#1:13', '#1:14', '#1:7']],
    ['#1:13', ['#1:11']],
    ['#1:14', ['#1:11']],
    ['#1:15', ['#1:16']],
    ['#1:16', ['#1:15', '#1:20']],
    ['#1:18', ['#1:20']],
    ['#1:2', ['#1:2', '#1:7']],
    ['#1:20', ['#1:16', '#1:18', '#1:24']],
    ['#1:24', ['#1:20', '#1:24']],
    ['#1:26', []],
    ['#1:4', ['#1:7']],
    ['#1:5', ['#1:7']],
    ['#1:7', ['#1:10', '#1:11', '#1:2', '#1:4', '#1:5']],
]);
const VADJACENCY_NOSELFLOOP = new Map(
    [...VADJACENCY].map(([k, v]) => {
        if (!VEDGES_NOSELFLOOP.has(`${k}-${k}` && v.includes(k))) {
            return [k, v.filter((el) => el !== k)];
        }
        return [k, v];
    }),
);
const VCOMPONENTS = [
    [...VNODES].slice(0, 8).map((x) => x[0]),
    [...VNODES].slice(8, 13).map((x) => x[0]),
    [...VNODES].slice(13, 14).map((x) => x[0]),
];

// SORTING
for (let i = 0; i < COMPONENTS.length; i++) {
    COMPONENTS[i].sort();
}

for (let i = 0; i < VCOMPONENTS.length; i++) {
    VCOMPONENTS[i].sort();
}

module.exports = {
    ADJACENCY,
    ADJACENCY_DIRECTED,
    COMPONENTS,
    EDGES,
    GRAPH,
    NODE_TO_VNODE_MAP,
    NODES,
    RECORDS,
    RECORDS_MAP,
    RIDs,
    VADJACENCY,
    VADJACENCY_NOSELFLOOP,
    VCOMPONENTS,
    VEDGES,
    VEDGES_INVERTED,
    VEDGES_NOSELFLOOP,
    VNODE_TO_NODE_MAP,
    VNODES,
};
