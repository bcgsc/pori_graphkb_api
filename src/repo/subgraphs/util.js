/**
 * SUBGRAPHS UTILITY FUNCTIONS
 */

const { schema: { models, subclassMapping }, ValidationError } = require('@bcgsc-pori/graphkb-schema');
const { logger } = require('../logging');
const {
    DEFAULT_DIRECTIONS,
    DEFAULT_EDGES,
    DEFAULT_TREEEDGES,
    MAX_SIZE,
    PAGE_SIZE,
} = require('./constants');

/**
 * Given a class name, returns all inheriting classes (from schema)
 *
 * @param {string} [superCls='V'] - The class acting as super class
 * @param {Object} [opt={}]
 * @param {boolean} [opt.includeAbstractCls=false] - Including abstract classes in the returned classes
 * @param {boolean} [opt.includeSuperCls=false] - Including the super class in the returned classes
 * @returns {Array.<string>} classes - An array of class names
 */
const getInheritingClasses = (superCls = 'V', {
    includeAbstractCls = false,
    includeSuperCls = false,
} = {}) => {
    const classes = [];

    // Recursively get all inherited classes
    const getMapping = (cls) => {
        if (subclassMapping[cls]) {
            subclassMapping[cls].forEach((x) => {
                classes.push(x);
                return getMapping(x);
            });
        }
    };
    getMapping(superCls);

    // Including the super class itself
    if (includeSuperCls) {
        classes.push(superCls);
    }

    // Discarding abstract classes, if any
    if (!includeAbstractCls) {
        return classes.filter((x) => !models[x].isAbstract);
    }
    return classes;
};

/**
 * Helper function for building the traverse string of a larger query string.
 *
 * @param {Object} [opt={}]
 * @param {string|null} [opt.direction=null] - The direction
 * @param {Array.<string>} [opt.edges=DEFAULT_EDGES] - The similarity Edges to follow in both directions
 * @param {Array.<string>} [opt.treeEdges=DEFAULT_TREEEDGES] - The hierarchy Edges to follow in the given direction
 * @param {boolean} [opt.withEdges=true] - Returning traversed Edge
 * @returns {string} traverseExpr - The traverse expression
 */
const buildTraverseExpr = ({
    direction = null,
    edges = DEFAULT_EDGES,
    treeEdges = DEFAULT_TREEEDGES,
    withEdges = true,
} = {}) => {
    let traverseExpr = '';

    if (!['ascending', 'descending'].includes(direction) && direction !== null) {
        throw new ValidationError(
            `'${direction}' is not a valid direction. Must be one of ascending|descending, or null`,
        );
    }

    // Expression for traversing similarity edges in both directions
    if (edges.length !== 0) {
        if (withEdges) {
            // both() & bothE()
            traverseExpr += `${edges.map((x) => `both('${x}'),bothE('${x}')`).join(',')}`;
        } else {
            // both()
            traverseExpr += `${edges.map((x) => `both('${x}')`).join(',')}`;
        }
    }

    // Expression for traversing hierarchy edges (treeEdges) in a the given direction
    if (direction) {
        if (edges.length !== 0 && treeEdges.length !== 0) {
            traverseExpr += ','; // needed for concatenation with previous string, if any
        }
        if (treeEdges.length !== 0) {
            const d = DEFAULT_DIRECTIONS[direction]; // ascending|descending => in|out

            if (withEdges) {
                // in()|out() & inE()|outE()
                traverseExpr += `${treeEdges.map((x) => `${d}('${x}'),${d}E('${x}')`).join(',')}`;
            } else {
                // in()|out()
                traverseExpr += `${treeEdges.map((x) => `${d}('${x}')`).join(',')}`;
            }
        }
    }

    return traverseExpr;
};

/**
 * Given a query string, query the database using pagination.
 * Returns an array of db records.
 *
 * Leverage RID pagination, which is expected to be faster that skipping.
 *
 * @param {Object} db - The database session object
 * @param {string} queryString - The original query string before pagination
 * @param {Object} [opt={}]
 * @param {number} [opt.maxSize=MAX_SIZE] - Total number of records limit
 * @param {number} [opt.pageSize=PAGE_SIZE] - Page size limit
 * @returns {Array.<Object>} records - The concatenated selected records
 */
const queryWithPagination = async (db, queryString, {
    maxSize = MAX_SIZE,
    pageSize = PAGE_SIZE,
} = {}) => {
    const records = [];

    // Given a queryString, returns it with added pagination
    // (woks with more or less basic query strings)
    const paginate = (initialQueryString, lowerLimit, limit) => {
        if (/WHERE[^)]*$/.test(initialQueryString)) {
            return `${initialQueryString} AND @rid > ${lowerLimit} LIMIT ${limit}`;
        }
        return `${initialQueryString} WHERE @rid > ${lowerLimit} LIMIT ${limit}`;
    };

    let lowerRid = '#-1:-1';

    while (true) {
        // Paginating
        const limit = maxSize - records.length < pageSize
            ? maxSize - records.length
            : pageSize;
        const paginatedQueryString = paginate(queryString, lowerRid, limit);
        logger.debug(paginatedQueryString);

        // Query
        const results = await db.query(paginatedQueryString).all();
        logger.debug(`page results: ${results.length}`);
        records.push(...results);

        // Breaking loop
        if (results.length < pageSize) { break; } // Stop if no more results
        if (records.length >= maxSize) { break; } // Stop if max limit is reached

        // Increment
        lowerRid = results[results.length - 1]['@rid'];
    }

    logger.debug(`paginated records: ${records.length}`);
    return records;
};

module.exports = {
    buildTraverseExpr,
    getInheritingClasses,
    queryWithPagination,
};
