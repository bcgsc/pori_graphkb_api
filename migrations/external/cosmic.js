/**
 * | | |
 * | --- | --- |
 * | Source | COSMIC |
 * | About | https://cancer.sanger.ac.uk/cosmic/about |
 * | Source Type | Knowledgebase |
 * | Data Example | https://cancer.sanger.ac.uk/cosmic/download (CosmicResistanceMutations.tsv.gz) |
 * | Data Format | Tab-delimited|
 *
 * Import COSMIC resistance mutation statements
 *
 * Expects column names like
 * - Gene Name
 * - Transcript
 * - Census Gene
 * - Drug Name
 * - ID Mutation
 * - AA Mutation
 * - CDS Mutation
 * - Primary Tissue
 * - Tissue Subtype 1
 * - Tissue Subtype 2
 * - Histology
 * - Histology Subtype 1
 * - Histology Subtype 2
 * - Pubmed Id
 * - CGP Study
 * - Somatic Status
 * - Sample Type
 * - Zygosity
 * - Genome Coordinates (GRCh38)
 * - Tier
 *
 * @module migrations/external/cosmic
 */
const request = require('request-promise');
const {
    addRecord,
    getRecordBy,
    orderPreferredOntologyTerms,
    getPubmedArticle,
    preferredDrugs,
    preferredDiseases,
    loadDelimToJson,
    rid
} = require('./util');

const THERAPY_MAPPING = {
    'tyrosine kinase inhibitor - ns': 'tyrosine kinase inhibitor',
    'endocrine therapy': 'hormone therapy agent'
};

const SOURCE_NAME = 'cosmic';


const processCosmicRecord = async (conn, record, source) => {
    // get the hugo gene
    const gene = await getRecordBy('features', {name: record['Gene Name'], source: {name: 'hgnc'}}, conn, orderPreferredOntologyTerms);
    // add the protein variant
    let variant = record['AA Mutation'];
    if (variant.startsWith('p.') && variant.includes('>')) {
        variant = variant.replace('>', 'delins');
    }
    variant = (await request(conn.request({
        method: 'POST',
        uri: 'parser/variant',
        body: {content: variant}
    }))).result;
    variant.reference1 = rid(gene);
    variant.type = rid(await getRecordBy('vocabulary', {name: variant.type}, conn));
    variant = await addRecord('positionalvariants', variant, conn, {existsOk: true});
    // get the enst transcript
    // const gene = await getRecordBy('features', {name: record['Transcript'], source: {name: 'ensembl'}, biotype: 'transcript'}, conn, orderPreferredOntologyTerms);
    // add the cds variant
    // get the chromosome
    // add the genome variant
    // link the variants
    // add the cosmic ID entry
    // link the cosmic ID to all variants
    // get the drug by name
    record['Drug Name'] = record['Drug Name'].toLowerCase();
    if (THERAPY_MAPPING[record['Drug Name']] !== undefined) {
        record['Drug Name'] = THERAPY_MAPPING[record['Drug Name']];
    }
    const drug = await getRecordBy('therapies', {name: record['Drug Name']}, conn, preferredDrugs);
    // get the disease by name
    let diseaseName = record['Histology Subtype 1'] === 'NS'
        ? record.Histology
        : record['Histology Subtype 1'];
    diseaseName = diseaseName.replace(/_/g, ' ');
    diseaseName = diseaseName.replace('leukaemia', 'leukemia');
    diseaseName = diseaseName.replace('tumour', 'tumor');
    const disease = await getRecordBy('diseases', {name: diseaseName}, conn, preferredDiseases);
    // create the resistance statement
    const relevance = await getRecordBy('vocabulary', {name: 'resistance'}, conn);
    await addRecord('statements', {
        relevance,
        appliesTo: drug,
        impliedBy: [{target: rid(variant)}, {target: rid(disease)}],
        supportedBy: [{target: rid(record.publication), source}],
        source: rid(source),
        reviewStatus: 'not required'
    }, conn, {
        existsOk: true,
        verbose: true,
        get: false
    });
};

/**
 * Given some TAB delimited file, upload the resulting statements to GraphKB
 *
 * @param {object} opt options
 * @param {string} opt.filename the path to the input tab delimited file
 * @param {ApiConnection} opt.conn the API connection object
 */
const uploadFile = async (opt) => {
    const {filename, conn} = opt;
    const jsonList = loadDelimToJson(filename);
    // get the dbID for the source
    const source = rid(await addRecord('sources', {
        name: SOURCE_NAME,
        url: 'https://cancer.sanger.ac.uk',
        usage: 'https://cancer.sanger.ac.uk/cosmic/terms'
    }, conn, {existsOk: true}));
    const pubmedSource = await addRecord('sources', {name: 'pubmed'}, conn, {existsOk: true});
    const counts = {success: 0, error: 0, skip: 0};
    const errorCache = {};
    console.log(`Processing ${jsonList.length} records`);
    for (const record of jsonList) {
        if (record['AA Mutation'] === 'p.?') {
            counts.skip++;
            continue;
        }
        let publication;
        try {
            publication = await getRecordBy('publications', {sourceId: record['Pubmed Id'], source: {name: 'pubmed'}}, conn);
        } catch (err) {
            publication = await getPubmedArticle(record['Pubmed Id']);
            publication = await addRecord('publications', Object.assign(publication, {
                source: rid(pubmedSource)
            }), conn, {existsOk: true});
        }
        record.publication = publication;
        try {
            await processCosmicRecord(conn, record, source);
            counts.success++;
        } catch (err) {
            const {message} = (err.error || err);
            if (errorCache[message] === undefined) {
                console.log('\nfailed', message);
                errorCache[message] = err;
            }
            counts.error++;
        }
    }
    console.log();
    console.log(counts);
    console.log(`${Object.keys(errorCache).length} unique errors`);
};

module.exports = {uploadFile};
