/**
 * Module responsible for parsing uberon OWL files and uploading them to the graph KB
 */
const rdf = require('rdflib');
const fs = require('fs');
const {addRecord, getRecordBy, convertOwlGraphToJson} = require('./util');


const SOURCE = 'uberon';


const parseUberonId = (string) => {
    let match = /.*\/UBERON_(\d+)$/.exec(string);
    if (match) {
        return `uberon:${match[1]}`;
    } else {
        throw new Error(`failed to parser ID from ${string}`);
    }
};

const parseSubsetName = (string) => {
    let match = /.*\/([^\/]+)$/.exec(string);
    if (match) {
        return match[1];
    } else {
        return string;
    }
};


const PRED_MAP = {
    CROSS_REF: 'http://www.geneontology.org/formats/oboInOwl#hasDbXref',
    SUBCLASSOF: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
    SUBSETOF: 'http://www.geneontology.org/formats/oboInOwl#inSubset',
    LABEL: 'http://www.w3.org/2000/01/rdf-schema#label',
    DESCRIPTION: 'http://purl.obolibrary.org/obo/IAO_0000115'
};


const uploadUberon = async ({filename, conn}) => {
    console.log(`reading: ${filename}`);
    const content = fs.readFileSync(filename).toString();
    const graph = rdf.graph();
    const records = {};
    const ncitLinks = [];
    console.log(`parsing: ${filename}`);
    rdf.parse(content, graph, 'http://purl.obolibrary.org/obo/uberon.owl', 'application/rdf+xml');

    const nodesByCode = convertOwlGraphToJson(graph, parseUberonId);

    const subclassEdges = [];

    console.log(`Adding the uberon ${Object.keys(nodesByCode).length} entity nodes`);
    for (let node of Object.values(nodesByCode)) {
        if (! node[PRED_MAP.LABEL] || ! node.code) {
            continue;
        }
        const body = {
            source: SOURCE,
            name: node[PRED_MAP.LABEL][0],
            sourceId: node.code
        };
        if (node[PRED_MAP.DESCRIPTION]) {
            body.description = node[PRED_MAP.DESCRIPTION][0];
        }
        if (node[PRED_MAP.SUBSETOF]) {
            body.subsets = Array.from(node[PRED_MAP.SUBSETOF], parseSubsetName);
        }
        if (node[PRED_MAP.SUBCLASSOF]) {
            for (let parentCode of node[PRED_MAP.SUBCLASSOF]) {
                subclassEdges.push({src: node.code, tgt: parentCode});
            }
        }
        if (node[PRED_MAP.CROSS_REF]) {
            for (let aliasCode of node[PRED_MAP.CROSS_REF]) {
                aliasCode = aliasCode.toLowerCase();
                if (/^ncit:c\d+$/.exec(aliasCode)) {
                    ncitLinks.push({src: node.code, tgt: aliasCode, source: SOURCE});
                }
            }
        }
        const dbEntry = await addRecord('anatomicalentities', body, conn, true);
        records[dbEntry.sourceId] = dbEntry;
    }
    console.log(`\nAdding the ${subclassEdges.length} subclassof relationships`);
    for (let {src, tgt} of subclassEdges) {
        if (records[src] && records[tgt]) {
            await addRecord('subclassof', {
                out: records[src]['@rid'],
                in: records[tgt]['@rid'],
                source: SOURCE
            }, conn, true);
        } else {
            process.stdout.write('x');
        }
    }

    console.log(`\nAdding the ${ncitLinks.length} uberon/ncit aliasof relationships`);
    for (let {src, tgt} of ncitLinks) {
        if (records[src] === undefined) {
            continue;
        }
        try {
            const ncitRecord = await getRecordBy('anatomicalentities', {source: 'ncit', sourceId: tgt}, conn);
            await addRecord('aliasof', {
                out: records[src]['@rid'],
                in: ncitRecord['@rid'],
                source: SOURCE
            }, conn, true);
        } catch (err) {
            // ignore missing vocabulary
            process.stdout.write('x');
        }
    }

    /*console.log('writing: uberon.tmp.json');
    jsonfile.writeFileSync('uberon.tmp.json', nodesByUberonId);
    console.log('json file has', Object.keys(nodesByUberonId).length, 'entries');*/
};

module.exports = {uploadUberon};