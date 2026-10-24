function notFound(req, res, next) {
    res.status(404).json({
        message: 'Endpoint not found'
    });
}

function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    console.error(err.message);

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            message: 'Validation failed',
            details: err.message
        });
    }

    if (err.name === 'CastError') {
        return res.status(400).json({
            message: 'Invalid ID format'
        });
    }

    if (err.code === 11000) {
        return res.status(409).json({
            message: 'Email or unique value already exists'
        });
    }

    const status = err.statusCode ?? err.status;

    if (Number.isInteger(status) && status >= 400 && status <= 599) {
        return res.status(status).json({
            message: err.message
        });
    }

    res.status(500).json({
        message: 'Internal server error'
    });
}

module.exports = { notFound, errorHandler };
