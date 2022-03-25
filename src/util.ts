import Ajv from 'ajv';


const stringifyAgvErrors = (ajvValidator: Ajv.ValidateFunction): string => {
    const errors = (ajvValidator.errors || [])[0] as {message: string} | undefined;  // Ajv type is incorrect here
    return `${errors && errors.message}`;
};

export {stringifyAgvErrors};
