/**
 * module responsible for setting up logging
 */
/**
 * @ignore
 */
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const split = require('split');

const transports = [
    new winston.transports.Console({
        colorize: true,
        level: process.env.GKB_LOG_LEVEL || 'debug',
        timestamp: true,
    }),
];

if (process.env.GKB_LOG_DIR) {
    transports.push(new DailyRotateFile({
        filename: path.join(process.env.GKB_LOG_DIR, `${process.env.npm_package_name}-%DATE%.log`),
        level: 'info',
        maxFiles: `${process.env.GKB_LOG_MAX_FILES || 14}d`, // remove logs more than 2 weeks old
        timestamp: true,
    }));
}

const logFormat = winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`);

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

module.exports = { logger, morganFormatter };
