/**
 * @module importer/entrez/pubmed
 */
const Ajv = require('ajv');

const { error: { AttributeError: ValidationError } } = require('@bcgsc/knowledgebase-schema');

const { requestWithRetry } = require('./util');

const ajv = new Ajv();
const PUBMED_LINK_URL = 'https://pubmed.ncbi.nlm.nih.gov';
const GENE_LINK_URL = 'https://www.ncbi.nlm.nih.gov/gene';


const publicationSpec = ajv.compile({
    properties: {
        // get the doi
        articleids: {
            items: {
                properties: {
                    idtype: { type: 'string' },
                    value: { type: 'string' },
                },
                required: ['idtype', 'value'],
                type: 'object',
            },
            type: 'array',
        },
        // create the authorList string
        authors: {
            items: {
                properties: {
                    name: { type: 'string' },
                },
                required: ['name'],
                type: 'object',
            },
            type: 'array',
        },
        // use the sort title since normalized
        fulljournalname: { type: 'string' },
        issue: { type: 'string' },
        pages: { type: 'string' },
        sortdate: { type: 'string' },
        sortpubdate: { type: 'string' },
        sorttitle: { type: 'string' },
        title: { type: 'string' },
        uid: { pattern: '^\\d+$', type: 'string' },
        volume: { type: 'string' },
    },
    required: ['uid', 'fulljournalname', 'sorttitle'],
    type: 'object',
});

const geneSpec = ajv.compile({
    properties: {
        description: { type: 'string' },
        name: { type: 'string' },
        uid: { pattern: '^\\d+$', type: 'string' },
    },
    required: ['uid', 'name'],
    type: 'object',
});

/**
 * Given an gene record retrieved from entrez, parse it into its equivalent
 * GraphKB representation
 */
const parseGeneRecord = (record) => {
    if (!geneSpec(record)) {
        throw new Error(`Failed to parse from the extension api (${geneSpec.errors[0].message})`);
    }
    return {
        biotype: 'gene',
        description: record.description,
        displayName: record.name,
        name: record.name,
        sourceId: record.uid,
        url: `${GENE_LINK_URL}/${record.uid}`,
    };
};

/**
 * Given an record record retrieved from pubmed, parse it into its equivalent
 * GraphKB representation
 */
const parsePubmedRecord = (record) => {
    if (!publicationSpec(record)) {
        throw new Error(`Failed to parse from the extension api (${publicationSpec.errors[0].message})`);
    }
    const parsed = {
        journalName: record.fulljournalname,
        name: record.sorttitle,
        sourceId: record.uid,
        url: `${PUBMED_LINK_URL}/${record.uid}`,
    };

    for (const key of ['issue', 'volume', 'pages']) {
        if (record[key]) {
            parsed[key] = record[key];
        }
    }

    if (record.authors) {
        const authorList = record.authors.map(({ name }) => name).join(', ');
        parsed.authors = authorList;
    }

    if (record.articleids) {
        for (const { idtype, value } of record.articleids) {
            if (idtype === 'doi') {
                parsed.doi = value;
                break;
            }
        }
    }

    // sortpubdate: '1992/06/01 00:00'
    if (record.sortpubdate) {
        const match = /^(\d\d\d\d)\//.exec(record.sortpubdate);

        if (match) {
            parsed.year = parseInt(match[1], 10);
        }
    } else if (record.sortdate) {
        const match = /^(\d\d\d\d)\//.exec(record.sortdate);

        if (match) {
            parsed.year = parseInt(match[1], 10);
        }
    }
    parsed.displayName = `pmid:${parsed.sourceId}`;
    return parsed;
};


const fetchRecord = async (db, id) => {
    const { result: { [id]: result } } = await requestWithRetry({
        headers: { Accept: 'application/json' },
        json: true,
        method: 'GET',
        qs: {
            db,
            id,
            retmode: 'json',
            rettype: 'docsum',
        },
        uri: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
    });

    if (db === 'pubmed') {
        return parsePubmedRecord(result);
    } if (db === 'gene') {
        return parseGeneRecord(result);
    }
    throw new ValidationError(`no parser for database (${db})`);
};


module.exports = {
    fetchRecord,
    parsePubmedRecord,
};
