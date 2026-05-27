/* eslint-disable no-return-await */
const _ = require('lodash');
const { parseVariant, jsonifyVariant } = require('@bcgsc-pori/graphkb-parser');
const { util: { looksLikeRID } } = require('@bcgsc-pori/graphkb-schema');

const { create, select } = require('../commands');
const { parse } = require('../query_builder/index');
const {
    RecordConflictError,
    NotImplementedError,
    ValidationError,
} = require('../error');

/**
 * Given a reference displayName from user input, format and
 * make sure any chromosomes is represented in a GraphKB-compatible way
 *
 * @param {string} ref the reference displayName
 * @returns {string} the formatted displayName
 */
const formatReferenceDisplayName = (ref) => {
    let match;

    // Chromosome reference handling
    if ((match = ref.match(/^CHR\d{1,2}$/i))) return ref.toLowerCase();
    if ((match = ref.match(/^\d{1,2}$/i))) return `chr${ref}`;
    if ((match = ref.match(/^(MT|X|Y)$/i))) return ref.toLowerCase();
    if ((match = ref.match(/^CHR(MT|X|Y)$/i))) return match[1].toLowerCase();
    if ((match = ref.match(/^NC_0*(\d+)(?:\.\d+)?$/i))) return `chr${match[1]}`; // RefSeq NC_

    // default, all caps for all non-chromosome references
    return ref.toUpperCase();
};

/**
 * Given a Vocabulary name as variant's type, returns its RID
 *
 * @param {Object} session the DB session object
 * @param {string} opt.type the variant type name
 * @returns {string} the strignified record's RID
 */
const getTypeRID = async (session, type) => {
    const result = await select(
        session,
        parse({
            filters: { name: type.toLowerCase() },
            returnProperties: ['@rid'],
            target: 'Vocabulary',
        }),
    );

    if (result.length === 0) {
        throw new NotImplementedError({
            message: `Vocabulary ${type} not implemented as DB record. Vocabulary ontology must be uploaded first`,
        });
    }
    return String(result[0]['@rid']);
};

/**
 * Given a Feature displayName (reference), returns its RID
 *
 * @param {Object} session the DB session object
 * @param {string} reference the reference displayName
 * @param {string} [opt.preferedRefSrcName] the name of the prefered reference source
 * @returns {string} the strignify record's RID
 */
const getReferenceRID = async (session, ref, { preferedRefSrcName } = {}) => {
    // Chromosome support
    const referenceDisplayName = formatReferenceDisplayName(ref);

    // Feature
    // Lookup on displayName for easier version support
    const result = await select(
        session,
        parse({
            filters: { displayName: referenceDisplayName },
            returnProperties: ['@rid', 'source.name'],
            target: 'Feature',
        }),
    );

    if (result.length === 0) {
        // TODO: Add support for new Feature upload
        throw new NotImplementedError({
            message: `Feature ${referenceDisplayName} not implemented as DB record`,
        });
    }
    if (result.length > 1) {
        // pick the one from prefered source
        if (preferedRefSrcName) {
            for (const r of result) {
                if (r.source.name === preferedRefSrcName) {
                    return String(r['@rid']);
                }
            }
        }
    }
    // defaults to 1st one
    return String(result[0]['@rid']);
};

/**
 * Extract and format content from an HGVS-like variant notation.
 * Type and references are replaced by their RIDs.
 *
 * @param {Object} session the DB session object
 * @param {string} notation the variant notation
 * @param {string} [opt.preferedRefSrcName] the name of the prefered reference source
 * @returns {object} the upload content of a PositionalVariant
 */
const getContent = async (session, notation, { preferedRefSrcName } = {}) => {
    // Validation
    if (typeof notation !== 'string' || notation.trim().length === 0) {
        throw new ValidationError(
            { message: 'notation is required and must be a non-empty string' },
        );
    }

    // Notation parsing
    const content = jsonifyVariant(
        parseVariant(notation),
    );

    // Replacing variant type by its RID
    content.type = await getTypeRID(session, content.type);

    // Replacing variant references by their RIDs
    content.reference1 = await getReferenceRID(
        session,
        content.reference1,
        { preferedRefSrcName },
    );

    if (content.reference2) {
        content.reference2 = await getReferenceRID(
            session,
            content.reference2,
            { preferedRefSrcName },
        );
    }

    return content;
};

/**
 * Given the upload content for a new PositionalVariant,
 * get the filters object for a select command
 *
 * @param {Object} content initially used to attempt creating a new PositionalVariant
 * @returns {object} the filters object
 */
const positionalVariantQueryFilters = (content) => ({
    AND: [
        'break1Repr',
        'break2Repr',
        'reference1',
        'reference2',
        'refSeq',
        'truncation',
        'type',
        'untemplatedSeq',
        'untemplatedSeqSize',
    ]
        .filter((prop) => prop in content)
        .map((prop) => ({ [prop]: content[prop] })),
});

/**
 * Upload a new PositionalVariant based on content
 * Will attempt to replace type and references by RIDs if needed
 * Existing record can optionally (default) be fetched and returned
 *
 * @param {Object} session the DB session object
 * @param {Object} user the user object
 * @param {Object} content the content's payload
 * @param {boolean} [opt.existsOk=true] to return existing record
 * @param {string} [opt.preferedRefSrcName] the name of the prefered reference source
 * @returns {[Record<string, any>, string]} Array containing:
 *   - first element: the record object
 *   - second element: the status name
 */
const uploadPositionalVariant = async (session, user, content, {
    existsOk = true,
    preferedRefSrcName,
} = {}) => {
    const payload = _.cloneDeep(content);

    // Make sure type is an RID
    if (!looksLikeRID(payload.type, true)) {
        payload.type = await getTypeRID(session, payload.type);
    }
    // Make sure references are RIDs
    if (!looksLikeRID(payload.reference1, true)) {
        payload.reference1 = await getReferenceRID(
            session,
            payload.reference1,
            { preferedRefSrcName },
        );
    }
    if (payload.reference2 && !looksLikeRID(payload.reference2, true)) {
        payload.reference2 = await getReferenceRID(
            session,
            payload.reference2,
            { preferedRefSrcName },
        );
    }

    // Upload
    try {
        return [
            await create(session, {
                content: payload,
                modelName: 'PositionalVariant',
                user,
            }),
            'CREATED',
        ];
    } catch (err) {
        // Return existing record
        if (err instanceof RecordConflictError && existsOk) {
            return [
                ...await select(
                    session,
                    parse({
                        filters: positionalVariantQueryFilters(payload),
                        target: 'PositionalVariant',
                    }),
                    { user },
                ),
                'OK',
            ];
        }
        throw err;
    }
};

module.exports = {
    formatReferenceDisplayName,
    getContent,
    getReferenceRID,
    getTypeRID,
    positionalVariantQueryFilters,
    uploadPositionalVariant,
};
