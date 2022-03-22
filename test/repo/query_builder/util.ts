export const stripSQL = (string) => string
    .replace(/\s+\./g, '.')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\{\n\s+/g, '{')
    .replace(/\n\s+\}/g, '}')
    .replace(/\s+/g, ' ')
    .trim();

export const printFunctionName = (func, value) => {
    if (value instanceof Function) {
        return `[Function: ${value.name || value.toString()}]`;
    }
    return value;
};
