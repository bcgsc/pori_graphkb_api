const Ajv = require('ajv');

const { logger } = require('../repo/logging');

const { requestWithRetry, parseXmlToJson } = require('./util');


const BASE_URL = 'https://clinicaltrials.gov/ct2/show';

const ajv = new Ajv();

const singleItemArray = (spec = { type: 'string' }) => ({
    items: { ...spec }, maxItems: 1, minItems: 1, type: 'array',
});

const validateAPITrialRecord = ajv.compile({
    properties: {
        clinical_study: {
            properties: {
                completion_date: singleItemArray({
                    properties: {
                        _: { type: 'string' },
                    },
                    required: ['_'],
                    type: 'object',
                }),
                condition: {
                    items: { type: 'string' },
                    type: 'array',
                },
                detailed_description: singleItemArray({
                    properties: {
                        textblock: singleItemArray({ type: 'string' }),
                    },
                    required: ['textblock'],
                    type: 'object',
                }),
                id_info: singleItemArray({
                    properties: { nct_id: singleItemArray({ pattern: '^NCT\\d+$' }) },
                    required: ['nct_id'],
                    type: 'object',
                }),
                intervention: {
                    items: {
                        properties: {
                            intervention_name: singleItemArray(),
                            intervention_type: singleItemArray(),
                        },
                        required: [
                            'intervention_type',
                            'intervention_name',
                        ],
                        type: 'object',
                    },
                    type: 'array',
                },
                last_update_posted: singleItemArray({
                    properties: { _: { type: 'string' } },
                    required: ['_'],
                    type: 'object',
                }),
                location: {
                    items: {
                        properties: {
                            facility: singleItemArray({
                                properties: {
                                    address: singleItemArray({
                                        properties: {
                                            city: singleItemArray(),
                                            country: singleItemArray(),
                                        },
                                        required: ['city', 'country'],
                                        type: 'object',
                                    }),
                                },
                                required: ['address'],
                                type: 'object',
                            }),
                        },
                        required: ['facility'],
                        type: 'object',
                    },
                    minItems: 1,
                    type: 'array',
                },
                official_title: singleItemArray(),
                phase: singleItemArray(),
                required_header: singleItemArray({
                    properties: { url: singleItemArray() },
                    required: ['url'],
                    type: 'object',
                }),
                start_date: singleItemArray({
                    oneOf: [
                        {
                            properties: {
                                _: { type: 'string' },
                            },
                            required: ['_'],
                            type: 'object',
                        },
                        { type: 'string' },
                    ],
                }),
            },
            required: [
                'id_info',
                'official_title',
                'phase',
                'condition',
                'intervention',
                'last_update_posted',
                'required_header',
                'location',
            ],
            type: 'object',
        },
    },
    required: ['clinical_study'],
    type: 'object',
});


const standardizeDate = (dateString) => {
    const dateObj = new Date(Date.parse(dateString));
    const month = dateObj.getMonth() + 1 < 10
        ? `0${dateObj.getMonth() + 1}`
        : dateObj.getMonth() + 1;
    const date = dateObj.getDate() < 10
        ? `0${dateObj.getDate()}`
        : dateObj.getDate();
    return `${dateObj.getFullYear()}-${month}-${date}`;
};


const processPhases = (phaseList) => {
    const phases = [];

    for (const raw of phaseList || []) {
        const cleanedPhaseList = raw.trim().toLowerCase().replace(/\bn\/a\b/, '').split(/[,/]/);

        for (const phase of cleanedPhaseList) {
            if (phase !== '' && phase !== 'not applicable') {
                const match = /^(early )?phase (\d+)$/.exec(phase);

                if (!match) {
                    throw new Error(`unrecognized phase description (${phase})`);
                }
                phases.push(match[2]);
            }
        }
    }
    return phases.sort().join('/');
};


/**
 * Given some records from the API, convert its form to a standard represention
 */
const parseRecord = (result) => {
    if (!validateAPITrialRecord(result)) {
        throw new Error(`Failed to parse from the extension api (${validateAPITrialRecord.errors[0].message})`);
    }
    const { clinical_study: record } = result;

    let startDate,
        completionDate;

    try {
        startDate = standardizeDate(record.start_date[0]._ || record.start_date[0]);
    } catch (err) {}

    try {
        completionDate = standardizeDate(record.completion_date[0]._);
    } catch (err) {}

    const content = {
        completionDate,
        diseases: record.condition,
        drugs: [],
        locations: [],
        name: record.official_title[0],
        sourceId: record.id_info[0].nct_id[0],
        sourceIdVersion: standardizeDate(record.last_update_posted[0]._),
        startDate,
        url: record.required_header[0].url[0],
    };

    if (record.detailed_description) {
        [content.description] = record.detailed_description[0].textblock;
    }
    if (record.phase) {
        content.phases = processPhases(record.phase);
    }

    for (const { intervention_name: [name], intervention_type: [type] } of record.intervention || []) {
        if (type.toLowerCase() === 'drug' || type.toLowerCase() === 'biological') {
            content.drugs.push(name);
        }
    }

    for (const location of record.location || []) {
        const { facility: [{ address: [{ country: [country], city: [city] }] }] } = location;
        content.locations.push({ city: city.toLowerCase(), country: country.toLowerCase() });
    }
    return content;
};


/**
 * Given some NCT ID, fetch and load the corresponding clinical trial information
 *
 * https://clinicaltrials.gov/ct2/show/NCT03478891?displayxml=true
 */
const fetchRecord = async (id) => {
    const url = `${BASE_URL}/${id}`;

    logger.info(`loading: ${url}`);
    // fetch from the external api
    const resp = await requestWithRetry({
        headers: { Accept: 'application/xml' },
        json: true,
        method: 'GET',
        qs: { displayxml: true },
        uri: url,
    });
    const result = await parseXmlToJson(resp);
    return parseRecord(result);
};


module.exports = {
    fetchRecord,
};
