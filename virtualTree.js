/* eslint-disable arrow-body-style */
/* eslint-disable no-return-await */
const { connectionWrapper } = require('./util');

const DISEASE_SOURCES = [ // Ordered by priority
    'oncotree',
    'oncokb',
    'iprkb',
    'ncit',
    'disease ontology',
    'civic',
];

const EDGES_SIMILARITY = [
    'AliasOf',
    'CrossReferenceOf',
    'DeprecatedBy',
];
const EDGES_ASCENDANCE = [
    'SubClassOf',
];

const DEPRECATED = new Set();
const ALIASING = new Set();

const getBaseNodes = async (db, { baseQuery }) => {
    const baseNodes = await db.query(baseQuery).all();
    return baseNodes.map((x) => `${x['@rid']}`).join(',');
};

const traversalExpr = ({
    direction,
    edgesAscendance = EDGES_ASCENDANCE,
    edgesSimilarity = EDGES_SIMILARITY,
}) => {
    let traverseExpr = '';

    if (edgesSimilarity) {
        traverseExpr += `${edgesSimilarity.map((x) => `both('${x}'),bothE('${x}')`).join(',')}`;
    }
    if (edgesSimilarity && edgesAscendance) {
        traverseExpr += ',';
    }
    if (edgesAscendance) {
        traverseExpr += `${edgesAscendance.map((x) => `${direction}('${x}'),${direction}E('${x}')`).join(',')}`;
    }

    return traverseExpr;
};

const traversal = async (db, {
    baseNodes,
    direction,
    nodeClass,
    edgesAscendance = EDGES_ASCENDANCE,
    edgesSimilarity = EDGES_SIMILARITY,
}) => {
    const traverseExpr = traversalExpr({
        direction,
        edgesAscendance,
        edgesSimilarity,
    });
    const classesExpr = [
        ...edgesAscendance,
        ...edgesSimilarity,
        nodeClass,
    ].map((x) => `'${x}'`).join(',');

    return await db.query(`
        SELECT
            @rid,@class,in,out,name,source.name
        FROM (
            TRAVERSE ${traverseExpr}
            FROM [${baseNodes}]
            WHILE @class in [${classesExpr}] AND deletedAt is null
        )
        WHERE
            @class in [${classesExpr}] AND
            deletedAt is null`)
        .all();
};

const termTree = async (db, {
    baseQuery,
    nodeClass,
    edgesAscendance = EDGES_ASCENDANCE,
    edgesSimilarity = EDGES_SIMILARITY,
}) => {
    // Base nodes
    const baseNodes = await getBaseNodes(db, { baseQuery });

    if (!baseNodes) {
        return new Map();
    }

    // Base nodes + Synonyms + Descendants with their synonyms
    const descendantRecords = await traversal(db, {
        baseNodes,
        direction: 'in',
        edgesAscendance,
        edgesSimilarity,
        nodeClass,
    });
    const descendants = new Map(descendantRecords.map((x) => [String(x['@rid']), x]));

    // Base nodes + Synonyms + Ancestors with their synonyms
    const ancestorRecords = await traversal(db, {
        baseNodes,
        direction: 'out',
        edgesAscendance,
        edgesSimilarity,
        nodeClass,
    });
    const ancestors = new Map(ancestorRecords.map((x) => [String(x['@rid']), x]));

    return new Map([...descendants, ...ancestors]);
};

const getPreferedRecord = (value, v) => {
    // Records with keys for sorting
    const records = [];

    value.forEach((rid) => {
        const source = v.get(rid)['source.name'];
        const sourcePriorityIndex = DISEASE_SOURCES.includes(source)
            ? DISEASE_SOURCES.indexOf(source)
            : 99;
        records.push({
            '@rid': rid,
            isAliasing: ALIASING.has(rid),
            isDeprecated: DEPRECATED.has(rid),
            sourcePriorityIndex,
        });
    });

    // Sorting
    records.sort((x, y) => {
        if (x.isDeprecated !== y.isDeprecated) {
            return x.isDeprecated - y.isDeprecated;
        }
        if (x.isAliasing !== y.isAliasing) {
            return x.isAliasing - y.isAliasing;
        }
        return x.sourcePriorityIndex - y.sourcePriorityIndex;
    });
    return records[0]['@rid'];
};

const getVirtualNodes = (e, v, edgesSimilarity = EDGES_SIMILARITY) => {
    // Grouping similar nodes, based on similarity edges
    const similar = new Map();
    e.forEach((value) => {
        if (edgesSimilarity.includes(value['@class'])) {
            const newIn = String(value.in);
            const newOut = String(value.out);

            if (!similar.has(newOut) && !similar.has(newIn)) {
                const newSet = new Set([newOut, newIn]);
                similar.set(newOut, newSet);
                similar.set(newIn, newSet);
            } else if (!similar.has(newOut)) {
                const inSet = similar.get(newIn);
                inSet.add(newOut);
                similar.set(newOut, inSet);
            } else if (!similar.has(newIn)) {
                const outSet = similar.get(newOut);
                outSet.add(newIn);
                similar.set(newIn, outSet);
            } else {
                const inSet = similar.get(newIn);
                const outSet = similar.get(newOut);
                outSet.forEach((val) => inSet.add(val));
                inSet.forEach((val) => {
                    similar.set(val, inSet);
                });
            }
        }
    });
    // Adding the nodes that are without any synonyms (therefor without similarity edges)
    v.forEach((r) => {
        const rid = String(r['@rid']);

        if (!similar.has(rid)) {
            const newSet = new Set([rid]);
            similar.set(rid, newSet);
        }
    });

    // Consolidating by removing duplicates
    const consolidated = new Set();
    similar.forEach((value) => {
        consolidated.add(value);
    });

    // Refactoring into virtualNodes list of node record object
    const virtualNodes = [];
    const lookup = new Map();
    consolidated.forEach((value) => {
        // Prefered ontology term
        const prefered = getPreferedRecord(value, v);

        // List of associated record names
        const records = [];
        value.forEach((x) => {
            records.push(v.get(x).name);
        });

        // Virtual node
        virtualNodes.push({
            id: prefered,
            label: v.get(prefered).name,
            records,
        });

        // Populating lookup Map for getting prefered synonym record from RID
        [...value].forEach((val) => {
            lookup.set(val, prefered);
        });
    });

    return [virtualNodes, lookup];
};

const getVirtualEdges = (lookup, e, edgesAscendance = EDGES_ASCENDANCE) => {
    // Mapping
    const virtualEdgesMap = new Map();
    e.forEach((value) => {
        if (edgesAscendance.includes(value['@class'])) {
            const outSet = String(value.out);
            const inSet = String(value.in);

            if (!virtualEdgesMap.has(outSet)) {
                virtualEdgesMap.set(outSet, new Set([inSet]));
            } else {
                virtualEdgesMap.get(outSet).add(inSet);
            }
        }
    });
    // Refactored into a list of objects
    const virtualEdges = [];
    virtualEdgesMap.forEach((value, key) => {
        value.forEach((v) => {
            virtualEdges.push({
                from: lookup.get(key),
                to: lookup.get(v),
                type: 'directed', // Can be useful for some rendering library
            });
        });
    });

    return virtualEdges;
};

const getMermaid = (v, e) => {
    const lines = ['flowchart BT'];

    v.forEach((node) => {
        lines.push(`${node.id}["${node.label}"]`);
    });

    e.forEach((edge) => {
        lines.push(`${edge.from} --> ${edge.to}`);
    });

    return lines.join('\n');
};

const virtualTree = async (db, {
    baseQuery,
    nodeClass,
    edgesAscendance = EDGES_ASCENDANCE,
    edgesSimilarity = EDGES_SIMILARITY,
}) => {
    // Real tree
    const tree = await termTree(db, {
        baseQuery,
        edgesAscendance,
        edgesSimilarity,
        nodeClass,
    });

    if (!tree) {
        return null;
    }

    // Dealing with nodes & edges separately
    const e = new Map();
    const v = new Map();
    tree.forEach((value, key) => {
        if ([...edgesAscendance, ...edgesSimilarity].includes(value['@class'])) {
            e.set(key, value);
        }
        if (value['@class'] === nodeClass) {
            v.set(key, value);
        }
        // Also, listing 'DEPRECATED' & 'ALIASING' nodes for node preference later on
        if (value['@class'] === 'DeprecatedBy') {
            DEPRECATED.add(String(value.in));
        }
        if (value['@class'] === 'AliasOf') {
            ALIASING.add(String(value.out));
        }
    });

    // Virtual tree
    const [virtualNodes, lookup] = getVirtualNodes(e, v, edgesSimilarity);
    const virtualEdges = getVirtualEdges(lookup, e, edgesAscendance);

    // Mermaid visualization format
    const mermaid = getMermaid(virtualNodes, virtualEdges);

    // OUTPUT
    console.log(mermaid);
};

// Example
const kbDiseaseMatch = 'breast tubular carcinoma'; // 'Breast Cancer'
connectionWrapper(virtualTree, {
    baseQuery: `
        SELECT FROM Disease
        WHERE name = '${kbDiseaseMatch.toLowerCase()}' AND
        deletedAt IS NULL`,
    nodeClass: 'Disease',
});
