const jwt = require('jsonwebtoken');
const { User } = require('../models');
const asyncRoute = require('../utils/asyncRoute');

const protect = asyncRoute(async (req, res, next) => {
    const authorization = req.headers.authorization || '';
    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({
            message: 'Authentication required'
        });
    }

    let payload;

    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return res.status(401).json({
            message: 'Invalid or expired token'
        });
    }

    const userId = payload.userId || payload.id || payload._id;

    if (!userId) {
        return res.status(401).json({
            message: 'Invalid authentication token'
        });
    }

    const user = await User.findById(userId);

    if (!user) {
        return res.status(401).json({
            message: 'User account not found'
        });
    }

    req.auth = {
        userId: user._id.toString(),
        role: user.role
    };

    next();
});

function roles(...allowedRoles) {
    return function (req, res, next) {
        if (!req.auth || !allowedRoles.includes(req.auth.role)) {
            return res.status(403).json({
                message: 'Permission denied'
            });
        }

        next();
    };
}

module.exports = { protect, roles };
