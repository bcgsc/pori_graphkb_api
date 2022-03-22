const { ErrorMixin } = require('@bcgsc-pori/graphkb-parser');
const { error } = require('@bcgsc-pori/graphkb-schema');

class ParsingError extends ErrorMixin {}

class ControlledVocabularyError extends ErrorMixin {}

class NoRecordFoundError extends ErrorMixin {}

class PermissionError extends ErrorMixin {}

class AuthenticationError extends ErrorMixin {}

class MultipleRecordsFoundError extends ErrorMixin {}

class RecordConflictError extends ErrorMixin {}

class NotImplementedError extends ErrorMixin {}

class DatabaseConnectionError extends ErrorMixin {}

class DatabaseRequestError extends ErrorMixin {}

const {AttributeError} = error;

export  {
    AttributeError,
    AuthenticationError,
    ControlledVocabularyError,
    DatabaseConnectionError,
    DatabaseRequestError,
    ErrorMixin,
    MultipleRecordsFoundError,
    NoRecordFoundError,
    NotImplementedError,
    ParsingError,
    PermissionError,
    RecordConflictError,
};
