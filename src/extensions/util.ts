import request from 'request-promise';
import sleep from 'sleep-promise';
import HTTP_STATUS_CODES from 'http-status-codes';
import xml2js from 'xml2js';

/**
 *  Try again for too many requests errors. Helpful for APIs with a rate limit (ex. pubmed)
 */
const requestWithRetry = async (requestOpt, { waitSeconds = 2, retries = 1 } = {}) => {
    try {
        const result = await request(requestOpt);
        return result;
    } catch (err) {
        if (err.statusCode === HTTP_STATUS_CODES.TOO_MANY_REQUESTS && retries > 0) {
            await sleep(waitSeconds);
            return requestWithRetry(requestOpt, { retries: retries - 1, waitSeconds });
        }
        throw err;
    }
};

const parseXmlToJson = (xmlContent, opts = {}) => new Promise((resolve, reject) => {
    xml2js.parseString(
        xmlContent,
        {
            emptyTag: null,
            mergeAttrs: true,
            normalize: true,
            trim: true,
            ...opts,
        },
        (err, result) => {
            if (err !== null) {
                reject(err);
            } else {
                resolve(result);
            }
        },
    );
});

export { parseXmlToJson, requestWithRetry };
