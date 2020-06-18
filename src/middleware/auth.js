/**
 * Module resposible for authentication and authroization related middleware functions
 */
/**
 * @ignore
 */
const HTTP_STATUS = require('http-status-codes');
const jwt = require('jsonwebtoken');

const { constants: { PERMISSIONS } } = require('@bcgsc/knowledgebase-schema');

const { PermissionError } = require('./../repo/error');
const { logger } = require('./../repo/logging');


/*
 * checks that the kbToken is valid/active
 */
const checkToken = privateKey => async (req, res, next) => {
    if (req.method === 'OPTIONS') {
        return next();
    }
    const token = req.header('Authorization');

    if (token === undefined) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: 'did not find authorized token', name: 'PermissionError' });
    }

    try {
        const decoded = jwt.verify(token, privateKey);
        req.user = decoded.user; // eslint-disable-line no-param-reassign
        return next();
    } catch (err) {
        logger.log('debug', err);
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(err);
    }
};

/**
 * Check that the user has permissions for a gicven operation
 */
const checkUserAccessFor = (user, modelName, operationPermission) => {
    for (const group of user.groups) {
        // Default to no permissions
        const groupPermission = group.permissions[modelName] === undefined
            ? PERMISSIONS.NONE
            : group.permissions[modelName];

        if (operationPermission & groupPermission) {
            return true;
        }
    }
    return false;
};


/**
 * Check that the user has permissions for the intended operation on a given route
 * Note that to do this, model and user need to already be assigned to the request
 *
 * @param {GraphKBRequest} req
 * @param {ClassModel} req.model the resolved model for this request
 *
 */
const checkClassPermissions = async (req, res, next) => {
    const { model, user } = req;
    const operation = req.method;

    const mapping = {
        DELETE: PERMISSIONS.DELETE,
        GET: PERMISSIONS.READ,
        PATCH: PERMISSIONS.UPDATE,
        POST: PERMISSIONS.CREATE,
        UPDATE: PERMISSIONS.UPDATE,
    };
    const operationPermission = mapping[operation];

    if (checkUserAccessFor(user, model.name, operationPermission)) {
        return next();
    }
    return res.status(HTTP_STATUS.FORBIDDEN).json(new PermissionError(
        `The user ${user.name} does not have sufficient permissions to perform a ${operation} operation on class ${model.name}`,
    ));
};

module.exports = {
    checkClassPermissions, checkToken, checkUserAccessFor,
};
