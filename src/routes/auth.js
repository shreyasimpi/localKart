const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { User } = require('../models');
const asyncRoute = require('../utils/asyncRoute');
const { protect } = require('../middleware/auth');
const currentUser = require('../utils/currentUser');

const router = express.Router();

// Register a customer or seller
router.post('/register', asyncRoute(async (req, res) => {
    const { name, email, password, phone = '', role } = req.body;

    if (!name || !email || !password ||
        !['seller', 'customer'].includes(role)) {
        return res.status(400).json({
            message: 'name, email, password and role (seller/customer) are required'
        });
    }

    if (String(password).length < 8) {
        return res.status(400).json({
            message: 'Password must be at least 8 characters'
        });
    }

    const user = await User.create({
        name,
        email,
        phone,
        role,
        passwordHash: await bcrypt.hash(password, 12)
    });

    res.status(201).json({
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        }
    });
}));

// Log in
router.post('/login', asyncRoute(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({
        email: String(email || '').toLowerCase()
    }).select('+passwordHash');

    if (!user || !password ||
        !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).json({
            message: 'Invalid email or password'
        });
    }

    const token = jwt.sign(
        {
            userId: String(user._id),
            role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    );

    res.json({
        token,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        }
    });
}));

// Get the logged-in user's profile
router.get('/me', protect, asyncRoute(async (req, res) => {
    res.json({ user: await currentUser(req) });
}));

module.exports = router;
