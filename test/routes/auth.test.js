const jwt = require('jsonwebtoken');
const fs = require('fs');

const {
    validateKeyCloakToken,
} = require('../../src/routes/auth');
const {
    AuthenticationError,
    PermissionError,
} = require('../../src/repo/error');

const PRIVATE_KEY = fs.readFileSync('test/data/test_key');
const PUBLIC_KEY = fs.readFileSync('test/data/test_key.pem');
const OTHER_KEY = fs.readFileSync('test/data/extra.pem');
const TOKEN_TIMEOUT = 10000;

describe('validateKeyCloakToken', () => {
    test('error on no roles', () => {
        const kcContent = {
            preferred_username: 'blargh',
            realm_access: {
                roles: [],
            },
        };
        const token = jwt.sign(kcContent, PRIVATE_KEY, { algorithm: 'RS256', expiresIn: TOKEN_TIMEOUT });
        expect(() => validateKeyCloakToken(token, PUBLIC_KEY, EXPECTED_ROLE)).toThrow(PermissionError);
    });

    test('error on missing roles array', () => {
        const kcContent = {
            preferred_username: 'blargh',
        };
        const token = jwt.sign(kcContent, PRIVATE_KEY, { algorithm: 'RS256', expiresIn: TOKEN_TIMEOUT });
        expect(() => validateKeyCloakToken(token, PUBLIC_KEY, EXPECTED_ROLE)).toThrow(PermissionError);
    });

    test('eror on only wrong roles', () => {
        const kcContent = {
            preferred_username: 'blargh',
            realm_access: {
                roles: ['non-monkeys'],
            },
        };
        const token = jwt.sign(kcContent, PRIVATE_KEY, { algorithm: 'RS256', expiresIn: TOKEN_TIMEOUT });
        expect(() => validateKeyCloakToken(token, PUBLIC_KEY, EXPECTED_ROLE)).toThrow(PermissionError);
    });

    test('error on bad token key', () => {
        const kcContent = {
            preferred_username: 'blargh',
        };
        const token = jwt.sign(kcContent, PRIVATE_KEY, { algorithm: 'RS256', expiresIn: TOKEN_TIMEOUT });
        expect(() => validateKeyCloakToken(token, OTHER_KEY, EXPECTED_ROLE)).toThrow(AuthenticationError);
    });

    test('ok for valid token', () => {
        const kcContent = {
            preferred_username: 'blargh',
        };
        const token = jwt.sign(kcContent, PRIVATE_KEY, { algorithm: 'RS256', expiresIn: TOKEN_TIMEOUT });
        const result = validateKeyCloakToken(token, PUBLIC_KEY);
        expect(result).toHaveProperty('preferred_username', 'blargh');
    });
});
