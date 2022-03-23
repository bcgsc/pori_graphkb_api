import Ajv from 'ajv';

import { logger } from '../repo/logging';

import { requestWithRetry, parseXmlToJson } from './util';
import spec from './clinicaltrialsgov.spec.json';

const BASE_URL = 'https://clinicaltrials.gov/ct2/show';

const ajv = new Ajv();

const validateAPITrialRecord = ajv.compile(spec);

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

export {
    fetchRecord,
};
