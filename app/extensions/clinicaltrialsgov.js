const Ajv = require('ajv');

const { logger } = require('../repo/logging');

const { requestWithRetry, parseXmlToJson } = require('./util');


const BASE_URL = 'https://clinicaltrials.gov/ct2/show';

const ajv = new Ajv();

const singleItemArray = (spec = { type: 'string' }) => ({
    type: 'array', maxItems: 1, minItems: 1, items: { ...spec },
});

const validateAPITrialRecord = ajv.compile({
    type: 'object',
    required: ['clinical_study'],
    properties: {
        clinical_study: {
            type: 'object',
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
            properties: {
                required_header: singleItemArray({
                    type: 'object',
                    required: ['url'],
                    properties: { url: singleItemArray() },
                }),
                start_date: singleItemArray({
                    oneOf: [
                        {
                            type: 'object',
                            required: ['_'],
                            properties: {
                                _: { type: 'string' },
                            },
                        },
                        { type: 'string' },
                    ],
                }),
                completion_date: singleItemArray({
                    type: 'object',
                    required: ['_'],
                    properties: {
                        _: { type: 'string' },
                    },
                }),
                id_info: singleItemArray({
                    type: 'object',
                    required: ['nct_id'],
                    properties: { nct_id: singleItemArray({ pattern: '^NCT\\d+$' }) },
                }),
                official_title: singleItemArray(),
                phase: singleItemArray(),
                condition: {
                    type: 'array',
                    items: { type: 'string' },
                },
                intervention: {
                    type: 'array',
                    items: {
                        type: 'object',
                        required: [
                            'intervention_type',
                            'intervention_name',
                        ],
                        properties: {
                            intervention_name: singleItemArray(),
                            intervention_type: singleItemArray(),
                        },
                    },
                },
                last_update_posted: singleItemArray({
                    type: 'object',
                    required: ['_'],
                    properties: { _: { type: 'string' } },
                }),
                location: {
                    type: 'array',
                    minItems: 1,
                    items: {
                        type: 'object',
                        required: ['facility'],
                        properties: {
                            facility: singleItemArray({
                                type: 'object',
                                required: ['address'],
                                properties: {
                                    address: singleItemArray({
                                        type: 'object',
                                        required: ['city', 'country'],
                                        properties: {
                                            city: singleItemArray(),
                                            country: singleItemArray(),
                                        },
                                    }),
                                },
                            }),
                        },
                    },
                },
                detailed_description: singleItemArray({
                    type: 'object',
                    required: ['textblock'],
                    properties: {
                        textblock: singleItemArray({ type: 'string' }),
                    },
                }),
            },
        },
    },
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
        sourceId: record.id_info[0].nct_id[0],
        name: record.official_title[0],
        url: record.required_header[0].url[0],
        sourceIdVersion: standardizeDate(record.last_update_posted[0]._),
        diseases: record.condition,
        drugs: [],
        startDate,
        completionDate,
        locations: [],
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
        content.locations.push({ country: country.toLowerCase(), city: city.toLowerCase() });
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
        method: 'GET',
        uri: url,
        qs: { displayxml: true },
        headers: { Accept: 'application/xml' },
        json: true,
    });
    const result = await parseXmlToJson(resp);
    return parseRecord(result);
};


module.exports = {
    fetchRecord,
};
