const express = require('express');
const HTTP_STATUS = require('http-status-codes');

const router = express.Router({ mergeParams: true });


// serve the spec as plain json
router.get('/spec.json', (req, res) => {
    const { spec } = req;
    res.status(HTTP_STATUS.OK).json(spec);
});

// serve with re-doc
router.get('/spec', (req, res) => {
    const content = `<!DOCTYPE html>
        <html>
          <head>
            <title>GraphKB API Spec</title>
            <!-- needed for adaptive design -->
            <meta charset="utf-8"/>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
            <style>
              body {
                margin: 0;
                padding: 0;
              }
            </style>
          </head>
          <body>
            <redoc require-props-first="true" sort-props-alphabetically="true" spec-url="${req.baseUrl}/spec.json"></redoc>
            <script src="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js"> </script>
          </body>
        </html>`;
    res.set('Content-Type', 'text/html');
    return res.status(HTTP_STATUS.OK).send(content);
});


module.exports = router;
