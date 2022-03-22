const form = require('form-urlencoded').default;
import request from 'request-promise';
import { logger } from '../repo/logging';

/**
 * Given a username and password, authenticate against keycloak and return the token
 *
 * @param {string} username the user name
 * @param {string} password the password
 * @param {object} keycloakSettings
 * @param {string} keycloakSettings.clientID key cloak client id
 * @param {string} keycloakSettings.uri the url to post to, to retrieve the token
 *
 * @returns {string} the access token
 *
 * @example
 * // The response we expect from KeyCloak
 * {
 *      access_token: 'eyJhbGciOiJSUzI1NiIsInR5cCIgOi...',
 *      expires_in: 43200,
 *      refresh_expires_in: 43200,
 *      refresh_token: 'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6IC...'
 *      token_type: 'bearer',
 *      'not-before-policy': 0,
 *      session_state: '1ecbceaf-bf4f-4fd8-96e7-...'
 * }
 */
const fetchKeyCloakToken = async (username, password, {
    GKB_KEYCLOAK_URI, GKB_KEYCLOAK_CLIENT_ID, GKB_KEYCLOAK_CLIENT_SECRET,
}) => {
    logger.log('debug', `[POST] ${GKB_KEYCLOAK_URI}`);
    const resp = JSON.parse(await request({
        body: form({
            client_id: GKB_KEYCLOAK_CLIENT_ID,
            client_secret: GKB_KEYCLOAK_CLIENT_SECRET,
            grant_type: 'password',
            password,
            username,
        }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        uri: GKB_KEYCLOAK_URI,
    }));
    return resp.access_token;
};

export { fetchKeyCloakToken as fetchToken  };
