const express = require('express');
const { Product, Shop } = require('../models');
const asyncRoute = require('../utils/asyncRoute');
const { protect, roles } = require('../middleware/auth');

const router = express.Router();

// List and search active products
router.get('/', asyncRoute(async (req, res) => {
    const filter = { isActive: true };

    if (req.query.category) {
        filter.category = new RegExp(String(req.query.category), 'i');
    }

    if (req.query.shopId) filter.shopId = req.query.shopId;
    if (req.query.sellerId) filter.sellerId = req.query.sellerId;

    if (req.query.q) {
        const query = new RegExp(String(req.query.q), 'i');
        filter.$or = [
            { name: query },
            { description: query },
            { tags: query }
        ];
    }

    if (req.query.minPrice !== undefined ||
        req.query.maxPrice !== undefined) {
        filter.price = {};

        if (req.query.minPrice !== undefined) {
            filter.price.$gte = Math.max(0, Number(req.query.minPrice));
        }

        if (req.query.maxPrice !== undefined) {
            filter.price.$lte = Math.max(0, Number(req.query.maxPrice));
        }
    }

    const page = Math.max(1, Number.parseInt(req.query.page) || 1);
    const limit = Math.min(
        50,
        Math.max(1, Number.parseInt(req.query.limit) || 12)
    );

    const sort = req.query.sort === 'price_asc'
        ? { price: 1 }
        : req.query.sort === 'price_desc'
            ? { price: -1 }
            : { createdAt: -1 };

    const [products, total] = await Promise.all([
        Product.find(filter)
            .populate('shopId', 'shopName city area')
            .sort(sort)
            .skip((page - 1) * limit)
            .limit(limit),
        Product.countDocuments(filter)
    ]);

    res.json({
        products,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    });
}));

// Get one active product
router.get('/:id', asyncRoute(async (req, res) => {
    const product = await Product.findOne({
        _id: req.params.id,
        isActive: true
    }).populate('shopId', 'shopName city area');

    if (!product) {
        return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ product });
}));

// Create a product (seller's own active shop only)
router.post('/', protect, roles('seller'), asyncRoute(async (req, res) => {
    const {
        shopId, name, description, category, price,
        stockQuantity, imageUrl, tags = []
    } = req.body;

    if (!shopId || !name || !category ||
        price === undefined || stockQuantity === undefined) {
        return res.status(400).json({
            message: 'shopId, name, category, price and stockQuantity are required'
        });
    }

    if (!Number.isFinite(Number(price)) || Number(price) < 0 ||
        !Number.isInteger(Number(stockQuantity)) ||
        Number(stockQuantity) < 0) {
        return res.status(400).json({
            message: 'Price must be non-negative and stock must be a non-negative integer'
        });
    }

    const shop = await Shop.findOne({
        _id: shopId,
        ownerId: req.auth.userId,
        isActive: true
    });

    if (!shop) {
        return res.status(403).json({
            message: 'Use your own active shop ID'
        });
    }

    const product = await Product.create({
        sellerId: req.auth.userId,
        shopId,
        name,
        description,
        category,
        price: Number(price),
        stockQuantity: Number(stockQuantity),
        imageUrl,
        tags: Array.isArray(tags) ? tags : []
    });

    res.status(201).json({ product });
}));

// Update a seller's own product
router.put('/:id', protect, roles('seller'), asyncRoute(async (req, res) => {
    const fields = [
        'name', 'description', 'category', 'price',
        'stockQuantity', 'imageUrl', 'tags', 'isActive'
    ];
    const updates = {};

    fields.forEach(key => {
        if (req.body[key] !== undefined) {
            updates[key] = req.body[key];
        }
    });

    if (updates.price !== undefined) {
        updates.price = Number(updates.price);

        if (!Number.isFinite(updates.price) || updates.price < 0) {
            return res.status(400).json({ message: 'Invalid price' });
        }
    }

    if (updates.stockQuantity !== undefined) {
        updates.stockQuantity = Number(updates.stockQuantity);

        if (!Number.isInteger(updates.stockQuantity) ||
            updates.stockQuantity < 0) {
            return res.status(400).json({
                message: 'Stock must be a non-negative integer'
            });
        }
    }

    if (updates.tags !== undefined && !Array.isArray(updates.tags)) {
        return res.status(400).json({ message: 'Tags must be an array' });
    }

    const product = await Product.findOneAndUpdate(
        { _id: req.params.id, sellerId: req.auth.userId },
        updates,
        { new: true, runValidators: true }
    );

    if (!product) {
        return res.status(404).json({
            message: 'Product not found or not yours'
        });
    }

    res.json({ product });
}));

// Deactivate a seller's own product
router.delete('/:id', protect, roles('seller'), asyncRoute(async (req, res) => {
    const product = await Product.findOneAndUpdate(
        { _id: req.params.id, sellerId: req.auth.userId },
        { isActive: false },
        { new: true }
    );

    if (!product) {
        return res.status(404).json({
            message: 'Product not found or not yours'
        });
    }

    res.json({ message: 'Product deactivated' });
}));

module.exports = router;
