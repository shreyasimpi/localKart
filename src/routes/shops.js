const express = require('express');
const { Shop } = require('../models');
const asyncRoute = require('../utils/asyncRoute');
const { protect, roles } = require('../middleware/auth');

const router = express.Router();

// List active shops; optionally filter by city, area, or category
router.get('/', asyncRoute(async (req, res) => {
    const filter = { isActive: true };

    for (const key of ['city', 'area', 'category']) {
        if (req.query[key]) {
            const escaped = String(req.query[key]).replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
            );
            filter[key] = new RegExp(escaped, 'i');
        }
    }

    res.json({
        shops: await Shop.find(filter)
            .sort({ createdAt: -1 })
            .limit(100)
    });
}));

// Get one active shop
router.get('/:id', asyncRoute(async (req, res) => {
    const shop = await Shop.findOne({
        _id: req.params.id,
        isActive: true
    });

    if (!shop) {
        return res.status(404).json({ message: 'Shop not found' });
    }

    res.json({ shop });
}));

// Create a shop (sellers only)
router.post('/', protect, roles('seller'), asyncRoute(async (req, res) => {
    const {
        shopName, description, category, address, city,
        area, contactNumber, logoUrl
    } = req.body;

    if (!shopName || !category || !address || !city) {
        return res.status(400).json({
            message: 'shopName, category, address and city are required'
        });
    }

    const shop = await Shop.create({
        ownerId: req.auth.userId,
        shopName, description, category, address, city,
        area, contactNumber, logoUrl
    });

    res.status(201).json({ shop });
}));

// Update a seller's own shop
router.put('/:id', protect, roles('seller'), asyncRoute(async (req, res) => {
    const fields = [
        'shopName', 'description', 'category', 'address',
        'city', 'area', 'contactNumber', 'logoUrl'
    ];
    const updates = {};

    fields.forEach(key => {
        if (req.body[key] !== undefined) {
            updates[key] = req.body[key];
        }
    });

    const shop = await Shop.findOneAndUpdate(
        { _id: req.params.id, ownerId: req.auth.userId },
        updates,
        { new: true, runValidators: true }
    );

    if (!shop) {
        return res.status(404).json({
            message: 'Shop not found or not yours'
        });
    }

    res.json({ shop });
}));

// Deactivate a seller's own shop
router.delete('/:id', protect, roles('seller'), asyncRoute(async (req, res) => {
    const shop = await Shop.findOneAndUpdate(
        { _id: req.params.id, ownerId: req.auth.userId },
        { isActive: false },
        { new: true }
    );

    if (!shop) {
        return res.status(404).json({
            message: 'Shop not found or not yours'
        });
    }

    res.json({ message: 'Shop deactivated' });
}));

module.exports = router;
