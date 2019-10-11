/**
 * @module importer/entrez/pubmed
 */
const Ajv = require('ajv');

const { error: { AttributeError: ValidationError } } = require('@bcgsc/knowledgebase-schema');

const { requestWithRetry } = require('./util');

const ajv = new Ajv();

const publicationSpec = ajv.compile({
    type: 'object',
    required: ['uid', 'title', 'fulljournalname'],
    properties: {
        uid: { type: 'string', pattern: '^\\d+$' },
        title: { type: 'string' },
        fulljournalname: { type: 'string' },
        sortpubdate: { type: 'string' },
        sortdate: { type: 'string' },
    },
});

const geneSpec = ajv.compile({
    type: 'object',
    required: ['uid', 'name'],
    properties: {
        uid: { type: 'string', pattern: '^\\d+$' },
        name: { type: 'string' },
        description: { type: 'string' },
    },
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
        sourceId: record.uid,
        name: record.name,
        biotype: 'gene',
        description: record.description,
        displayName: record.name,
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
        sourceId: record.uid,
        name: record.title,
        journalName: record.fulljournalname,
    };

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
        method: 'GET',
        uri: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi',
        qs: {
            retmode: 'json',
            rettype: 'docsum',
            db,
            id,
        },
        headers: { Accept: 'application/json' },
        json: true,
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
};
