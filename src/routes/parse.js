const HTTP_STATUS = require('http-status-codes');
const jc = require('json-cycle');
const express = require('express');

const { error: { AttributeError } } = require('@bcgsc/knowledgebase-schema');
const {
    variant: { parse: variantParser },
    error: { ParsingError },
} = require('@bcgsc/knowledgebase-parser');


const router = express.Router({ mergeParams: true });

router.post('/', async (req, res, next) => {
    if (!req.body || !req.body.content) {
        return next(new AttributeError('body.content is a required input'));
    }
    const { content, requireFeatures = true, ...rest } = req.body;

    if (Object.keys(rest).length) {
        return next(new AttributeError(`Unexpected attributes: ${Object.keys(rest).join(', ')}`));
    }

    try {
        const parsed = variantParser(content, requireFeatures);
        return res.status(HTTP_STATUS.OK).json({ result: parsed });
    } catch (err) {
        if (err instanceof ParsingError) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(jc.decycle(err));
        }
        return next(err);
    }
});


module.exports = router;
