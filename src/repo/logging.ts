/**
 * module responsible for setting up logging
 */
/**
 * @ignore
 */
import winston from 'winston';
import split from 'split';

const transports = [
    new winston.transports.Console({
        colorize: true,
        level: process.env.GKB_LOG_LEVEL || 'debug',
        timestamp: true,
    }),
];

const logFormat = winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`);

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp(),
        logFormat,
    ),
    levels: winston.config.npm.levels,
    transports,
});
// for morgan http://tostring.it/2014/06/23/advanced-logging-with-nodejs/
logger.stream = split().on('data', (message) => {
    logger.info(message);
});

const morganFormatter = (tokens, req, res) => {
    const userName = (req.user && req.user.name)
        || (req.body && req.body.username)
        || 'anonymous';
    return [
        `[${tokens.method(req, res)}]`,
        userName,
        tokens.url(req, res),
        tokens.status(req, res),
        tokens.res(req, res, 'content-length'), '-',
        tokens['response-time'](req, res), 'ms',
    ].join(' ');
};

export { logger, morganFormatter };
