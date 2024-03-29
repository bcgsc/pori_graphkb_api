const jwt = require('jsonwebtoken');
const jc = require('json-cycle');
const HTTP_STATUS = require('http-status-codes');

const { getUserByName } = require('../repo/commands');
const { incrementUserVisit } = require('../repo');
const { logger } = require('../repo/logging');
const { AuthenticationError, PermissionError, NoRecordFoundError } = require('../repo/error');
const { fetchToken: fetchKeyCloakToken } = require('./keycloak');

const TOKEN_TIMEOUT = 60 * 60 * 8; // default timeout is 8 hours

/**
 * Look up a username in the database and generate a token for this user
 *
 * @param {orientjs.Db} db the database connection object
 * @param {string} username
 * @param {string} key the private key file contents
 * @param exp the expiry time/date
 *
 * @returns {string} the token
 */
const generateToken = async (db, username, key, exp = null) => {
    const user = jc.decycle(await getUserByName(db, username));

    if (exp === null) {
        return jwt.sign({ user }, key, { expiresIn: TOKEN_TIMEOUT });
    }
    return jwt.sign({ exp, user }, key);
};

/**
 * Verify the token and ensure the user has the appropriate role to access GraphKB
 *
 * @param {string} token the token to be parsed
 * @param {string} key the public key file contents to use to verify the token
 * @param {string} role the role that should be encoded into the token to allow access
 *
 * @returns {object} the parsed content of the key cloak token
 */
const validateKeyCloakToken = (token, key, role) => {
    let parsed;

    try {
        jwt.verify(token, key, { algorithms: ['RS256'] });
        parsed = jwt.decode(token);
    } catch (err) {
        throw new AuthenticationError(err);
    }

    if (
        parsed.realm_access
        && parsed.realm_access.roles
        && parsed.realm_access.roles.includes(role)
    ) {
        return parsed;
    }
    throw new PermissionError(`Insufficient permissions. User must have the role: ${role}`);
};

/**
 * Add the post token route to the input router
 *
 * @param {AppServer} app the GraphKB app server
 */
const addPostToken = (app) => {
    const {
        GKB_DISABLE_AUTH, GKB_KEYCLOAK_KEY, GKB_KEYCLOAK_ROLE, GKB_KEY,
    } = app.conf;

    app.router.route('/token').post(async (req, res, next) => {
        // generate a token to return to the user
        if ((req.body.username === undefined || req.body.password === undefined) && req.body.keyCloakToken === undefined) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'body requires both username and password to generate a token or an external keycloak token (keyCloakToken)' });
        }
        // passed a token already
        let { keyCloakToken } = req.body;

        if (keyCloakToken === undefined) {
            if (req.body.username === undefined || req.body.password === undefined) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'body requires both username and password to generate a token or an external keycloak token (keyCloakToken)' });
            }
            // get the keyCloakToken
            if (!GKB_DISABLE_AUTH) {
                try {
                    keyCloakToken = await fetchKeyCloakToken(req.body.username, req.body.password, app.conf);
                } catch (err) {
                    logger.log('debug', err);
                    return res.status(HTTP_STATUS.UNAUTHORIZED).json(err);
                }
            }
        }
        // verify the keyCloakToken
        let kcTokenContent;

        if (!GKB_DISABLE_AUTH) {
            try {
                kcTokenContent = validateKeyCloakToken(keyCloakToken, GKB_KEYCLOAK_KEY, GKB_KEYCLOAK_ROLE);
            } catch (err) {
                if (err instanceof PermissionError) {
                    logger.log('debug', err);
                    return res.status(HTTP_STATUS.FORBIDDEN).json(err);
                }
                logger.log('debug', err);
                return res.status(HTTP_STATUS.UNAUTHORIZED).json(err);
            }
        } else {
            kcTokenContent = { exp: null, preferred_username: req.body.username };
        }

        // kb-level authentication
        let token,
            session;

        try {
            session = await app.pool.acquire();
        } catch (err) {
            return next(err);
        }

        try {
            token = await generateToken(session, kcTokenContent.preferred_username, GKB_KEY, kcTokenContent.exp);

            // increment the login count for this user but do not wait for this to return the response
            incrementUserVisit(session, kcTokenContent.preferred_username)
                .then(() => { session.close(); })
                .catch((err) => {
                    session.close();
                    logger.log('warn', err);
                });
        } catch (err) {
            session.close();
            logger.log('debug', err);

            if (err instanceof NoRecordFoundError) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json(err);
            }
            return next(err);
        }
        return res.status(HTTP_STATUS.OK).json({ kbToken: token, keyCloakToken });
    });
};

module.exports = { addPostToken, generateToken, validateKeyCloakToken };
