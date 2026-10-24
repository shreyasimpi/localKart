const { User } = require('../models');

async function currentUser(req) {
    return User.findById(req.auth.userId).select('-passwordHash');
}

module.exports = currentUser;
