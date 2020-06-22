const pm2io = require('@pm2/io');

const activeRequestsCounter = pm2io.counter({
    name: 'Current req processed',
    type: 'counter',
});

const countActiveRequests = (req, res, next) => {
    activeRequestsCounter.inc();
    req.on('end', () => activeRequestsCounter.dec());
    return next();
};

module.exports = { countActiveRequests };
