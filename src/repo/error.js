

const { error: { AttributeError } } = require('@bcgsc/knowledgebase-schema');
const { error: { ErrorMixin } } = require('@bcgsc/knowledgebase-parser');


class ParsingError extends ErrorMixin {}


class ControlledVocabularyError extends ErrorMixin {}


class NoRecordFoundError extends ErrorMixin {}


class PermissionError extends ErrorMixin {}


class AuthenticationError extends ErrorMixin {}


class MultipleRecordsFoundError extends ErrorMixin {}


class RecordExistsError extends ErrorMixin {}


class NotImplementedError extends ErrorMixin {}


class DatabaseConnectionError extends ErrorMixin {}


class DatabaseRequestError extends ErrorMixin {}


module.exports = {
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
    RecordExistsError,
};
