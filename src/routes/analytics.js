const express = require('express');
const { Product, Order } = require('../models');
const asyncRoute = require('../utils/asyncRoute');
const { protect, roles } = require('../middleware/auth');

const router = express.Router();

// Seller overview: active products, order count, and sales
router.get('/seller/overview', protect, roles('seller'), asyncRoute(async (req, res) => {
    const [activeProducts, orders] = await Promise.all([
        Product.countDocuments({
            sellerId: req.auth.userId,
            isActive: true
        }),
        Order.find({
            'items.sellerId': req.auth.userId,
            orderStatus: { $ne: 'cancelled' }
        }).select('items')
    ]);

    const sales = orders.reduce(
        (sum, order) => sum + order.items
            .filter(item => String(item.sellerId) === req.auth.userId)
            .reduce((subtotal, item) => subtotal + item.subtotal, 0),
        0
    );

    res.json({
        activeProducts,
        orderCount: orders.length,
        sales: Number(sales.toFixed(2))
    });
}));

// Seller's active products with low stock
router.get('/seller/low-stock', protect, roles('seller'), asyncRoute(async (req, res) => {
    const threshold = Math.max(
        0,
        Number(process.env.LOW_STOCK_THRESHOLD) || 5
    );

    const products = await Product.find({
        sellerId: req.auth.userId,
        isActive: true,
        stockQuantity: { $lte: threshold }
    }).sort({ stockQuantity: 1 });

    res.json({ threshold, products });
}));

// Seller's top 10 products by quantity sold
router.get('/seller/top-products', protect, roles('seller'), asyncRoute(async (req, res) => {
    const orders = await Order.find({
        'items.sellerId': req.auth.userId,
        orderStatus: { $ne: 'cancelled' }
    }).select('items');

    const map = {};

    for (const order of orders) {
        for (const item of order.items) {
            if (String(item.sellerId) !== req.auth.userId) continue;

            const id = String(item.productId);

            map[id] ||= {
                productId: id,
                name: item.productName,
                quantitySold: 0,
                revenue: 0
            };

            map[id].quantitySold += item.quantity;
            map[id].revenue += item.subtotal;
        }
    }

    res.json({
        products: Object.values(map)
            .sort((a, b) => b.quantitySold - a.quantitySold)
            .slice(0, 10)
    });
}));

module.exports = router;
