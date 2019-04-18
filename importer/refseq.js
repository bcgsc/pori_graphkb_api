/**
 * Import the RefSeq transcripts, ignoring version numbers for now
 * @module importer/refseq
 */
const {
    orderPreferredOntologyTerms, loadDelimToJson, rid
} = require('./util');
const {logger} = require('./logging');


const SOURCE_DEFN = {
    name: 'refseq',
    url: 'https://www.ncbi.nlm.nih.gov/refseq',
    usage: 'https://www.ncbi.nlm.nih.gov/home/about/policies',
    description: 'A comprehensive, integrated, non-redundant, well-annotated set of reference sequences including genomic, transcript, and protein.'
};

/**
 * Parse the tab delimited file to upload features and their relationships
 * For each versioned feature, a generalization (non-versioned) feature is created
 * to facilitate linking from other sources where the version may not be given
 *
 * @param {object} opt options
 * @param {string} opt.filename path to the tab delimited file
 * @param {ApiConnection} opt.conn the api connection object
 */
const uploadFile = async (opt) => {
    const {filename, conn} = opt;
    const json = await loadDelimToJson(filename);

    const source = await conn.addRecord({
        endpoint: 'sources',
        content: SOURCE_DEFN,
        existsOk: true,
        fetchConditions: {name: SOURCE_DEFN.name}
    });
    let hgncSource;
    try {
        hgncSource = await conn.getUniqueRecordBy({
            endpoint: 'sources',
            name: 'hgnc'
        });
    } catch (err) {
        logger.warn('Unable to retrieve hgnc source. Will not attempt cross-referencing');
    }
    logger.log('info', `Loading ${json.length} gene records`);
    const hgncMissingRecords = new Set();

    for (const record of json) {
        // Load the RNA
        const [rnaName, rnaVersion] = record.RNA.split('.');
        const general = await conn.addRecord({
            endpoint: 'features',
            content: {
                biotype: 'transcript', source: rid(source), sourceId: rnaName, sourceIdVersion: null
            },
            existsOk: true
        });
        const versioned = await conn.addRecord({
            endpoint: 'features',
            content: {
                biotype: 'transcript', source: rid(source), sourceId: rnaName, sourceIdVersion: rnaVersion
            },
            existsOk: true
        });
        // make the general an alias of the versioned
        await conn.addRecord({
            endpoint: 'generalizationof',
            content: {out: rid(general), in: rid(versioned), source: rid(source)},
            existsOk: true,
            fetchExisting: false
        });

        let hgnc;
        if (hgncSource) {
            try {
                hgnc = await conn.getUniqueRecordBy({
                    endpoint: 'features',
                    where: {source: rid(hgncSource), name: record.Symbol},
                    sort: orderPreferredOntologyTerms
                });
                await conn.addRecord({
                    endpoint: 'elementof',
                    content: {out: rid(general), in: rid(hgnc), source: rid(source)},
                    existsOk: true,
                    fetchExisting: false
                });
            } catch (err) {
                hgncMissingRecords.add(record.symbol);
            }
        }
        // load the protein
        if (record.Protein) {
            const [proteinName, proteinVersion] = record.Protein.split('.');
            const generalProtein = await conn.addRecord({
                endpoint: 'features',
                content: {
                    biotype: 'protein', source: rid(source), sourceId: proteinName, sourceIdVersion: null
                },
                existsOk: true
            });
            const versionedProtein = await conn.addRecord({
                endpoint: 'features',
                content: {
                    biotype: 'protein', source: rid(source), sourceId: proteinName, sourceIdVersion: proteinVersion
                },
                existsOk: true
            });
            // make the general an alias of the versioned
            await conn.addRecord({
                endpoint: 'generalizationof',
                content: {
                    out: rid(generalProtein),
                    in: rid(versionedProtein),
                    source: rid(source)
                },
                existsOk: true,
                fetchExisting: false
            });

            await conn.addRecord({
                endpoint: 'elementof',
                content: {
                    out: rid(generalProtein),
                    in: rid(general),
                    source: rid(source)
                },
                existsOk: true,
                fetchExisting: false
            });

            await conn.addRecord({
                endpoint: 'elementof',
                content: {
                    out: rid(versionedProtein),
                    in: rid(versioned),
                    source: rid(source)
                },
                existsOk: true,
                fetchExisting: false
            });
        }
    }
    if (hgncMissingRecords.size) {
        logger.warn(`Unable to retrieve ${hgncMissingRecords.size} hgnc records for linking`);
    }
};

module.exports = {uploadFile, SOURCE_DEFN};
