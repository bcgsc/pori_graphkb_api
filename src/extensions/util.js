const request = require('request-promise');
const sleep = require('sleep-promise');
const HTTP_STATUS_CODES = require('http-status-codes');
const xml2js = require('xml2js');

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
            return requestWithRetry(requestOpt, { waitSeconds, retries: retries - 1 });
        }
        throw err;
    }
};


const parseXmlToJson = (xmlContent, opts = {}) => new Promise((resolve, reject) => {
    xml2js.parseString(
        xmlContent,
        {
            trim: true,
            emptyTag: null,
            mergeAttrs: true,
            normalize: true,
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


module.exports = { requestWithRetry, parseXmlToJson };
