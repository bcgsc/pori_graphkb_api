const express = require('express');
const { getPortPromise } = require('portfinder');
const fs = require('fs');
const path = require('path');
const http = require('http');
const HTTP_STATUS = require('http-status-codes');
const requestPromise = require('request-promise');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

const { router: authRouter } = require('./../../src/routes/auth');
const errorRouter = require('../../src/middleware/error');

const request = async opt => requestPromise({ json: true, resolveWithFullResponse: true, ...opt });

const privateKey = fs.readFileSync(path.join(__dirname, 'kcTestKey')).toString();
const publicKey = fs.readFileSync(path.join(__dirname, 'kcTestKey.pub.pem')).toString();

describe('/token', () => {
    let server,
        url;

    beforeAll(async () => {
        const app = express();
        app.use(bodyParser.urlencoded({ extended: true }));
        app.use(bodyParser.json());
        app.use((req, res, next) => {
            // mock db etc
            req.conf = {
                GKB_KEYCLOAK_KEY: publicKey,
                GKB_KEYCLOAK_ROLE: 'cinnamon',
            };
            return next();
        });
        app.use('/token', authRouter);
        app.use(errorRouter);
        const port = await getPortPromise();
        server = http.createServer(app).listen(port);
        url = `http://localhost:${port}`;
    });

    afterAll(() => {
        server.close();
    });

    test('error on missing username', async () => {
        let err = {};

        try {
            await request({
                body: { password: 'blargh' },
                method: 'POST',
                uri: `${url}/token`,
            });
        } catch ({ response }) {
            err = response;
        }
        expect(err.statusCode).toEqual(HTTP_STATUS.BAD_REQUEST);
    });

    test('error on missing password', async () => {
        let err = {};

        try {
            await request({
                body: { username: 'blargh' },
                method: 'POST',
                uri: `${url}/token`,
            });
        } catch ({ response }) {
            err = response;
        }
        expect(err.statusCode).toEqual(HTTP_STATUS.BAD_REQUEST);
    });

    test('error on keycloak token missing required role', async () => {
        const badToken = jwt.sign(
            { realm_access: { roles: ['raisin'] } },
            privateKey,
            { algorithm: 'RS256' },
        );
        let err = {};

        try {
            await request({
                body: { keyCloakToken: badToken },
                method: 'POST',
                uri: `${url}/token`,
            });
        } catch ({ response }) {
            err = response;
        }
        expect(err.statusCode).toEqual(HTTP_STATUS.FORBIDDEN);
        expect(err.body.message).toContain('User must have the role: cinnamon');
    });

    test('error on expired token', async () => {
        const badToken = jwt.sign(
            { realm_access: { roles: ['cinnamon'] } },
            privateKey,
            { algorithm: 'RS256', expiresIn: 0 },
        );
        let err = {};

        try {
            await request({
                body: { keyCloakToken: badToken },
                method: 'POST',
                uri: `${url}/token`,
            });
        } catch ({ response }) {
            err = response;
        }
        expect(err.statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED);
        expect(err.body.message).toContain('jwt expired');
    });

    test('error on malformed token', async () => {
        const badToken = jwt.sign(
            { realm_access: { roles: ['cinnamon'] } },
            'secret',
            { expiresIn: 0 },
        );
        let err = {};

        try {
            await request({
                body: { keyCloakToken: badToken },
                method: 'POST',
                uri: `${url}/token`,
            });
        } catch ({ response }) {
            err = response;
        }
        expect(err.statusCode).toEqual(HTTP_STATUS.UNAUTHORIZED);
        expect(err.body.message).toContain('invalid algorithm');
    });
});
