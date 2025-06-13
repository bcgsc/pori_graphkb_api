/**
 * SUBGRAPHS UTILITY FUNCTIONS
 */

const { schema: { models, subclassMapping } } = require('@bcgsc-pori/graphkb-schema');

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

module.exports = {
    getInheritingClasses,
};
