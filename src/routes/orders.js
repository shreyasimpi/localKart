const express = require('express');
const mongoose = require('mongoose');

const { Product, Order } = require('../models');
const asyncRoute = require('../utils/asyncRoute');
const { protect, roles } = require('../middleware/auth');

const router = express.Router();

// Place an order and deduct stock atomically
router.post('/', protect, roles('customer'), asyncRoute(async (req, res) => {
    const {
        items,
        deliveryAddress,
        paymentMethod = 'COD'
    } = req.body;

    if (!Array.isArray(items) || !items.length || !deliveryAddress) {
        return res.status(400).json({
            message: 'items and deliveryAddress are required'
        });
    }

    if (!['COD', 'ONLINE'].includes(paymentMethod)) {
        return res.status(400).json({
            message: 'paymentMethod must be COD or ONLINE'
        });
    }

    const quantities = new Map();

    for (const item of items) {
        const id = String(item.productId || '');
        const qty = Number(item.quantity);

        if (!mongoose.isValidObjectId(id) ||
            !Number.isInteger(qty) || qty < 1) {
            return res.status(400).json({
                message: 'Each item needs a valid productId and positive integer quantity'
            });
        }

        quantities.set(id, (quantities.get(id) || 0) + qty);
    }

    const session = await mongoose.startSession();
    let order;

    try {
        await session.withTransaction(async () => {
            const orderItems = [];
            let total = 0;

            for (const [id, qty] of quantities) {
                const product = await Product.findOneAndUpdate(
                    {
                        _id: id,
                        isActive: true,
                        stockQuantity: { $gte: qty }
                    },
                    { $inc: { stockQuantity: -qty } },
                    { new: true, session }
                );

                if (!product) {
                    const error = new Error(
                        'A product is unavailable or does not have enough stock'
                    );
                    error.status = 409;
                    throw error;
                }

                const subtotal = Number((product.price * qty).toFixed(2));
                total += subtotal;

                orderItems.push({
                    productId: product._id,
                    sellerId: product.sellerId,
                    productName: product.name,
                    quantity: qty,
                    unitPrice: product.price,
                    subtotal
                });
            }

            const docs = await Order.create([{
                customerId: req.auth.userId,
                items: orderItems,
                totalAmount: Number(total.toFixed(2)),
                deliveryAddress,
                paymentMethod
            }], { session });

            order = docs[0];
        });
    } finally {
        await session.endSession();
    }

    res.status(201).json({
        message: 'Order placed',
        order
    });
}));

// List the logged-in customer's orders
router.get('/my-orders', protect, roles('customer'), asyncRoute(async (req, res) => {
    const orders = await Order.find({
        customerId: req.auth.userId
    }).sort({ createdAt: -1 });

    res.json({ orders });
}));

// List orders containing this seller's products
router.get('/seller-orders', protect, roles('seller'), asyncRoute(async (req, res) => {
    const orders = await Order.find({
        'items.sellerId': req.auth.userId
    }).sort({ createdAt: -1 });

    res.json({ orders });
}));

// Get an order only if the user owns or sells an item in it
router.get('/:id', protect, asyncRoute(async (req, res) => {
    const order = await Order.findById(req.params.id);

    if (!order) {
        return res.status(404).json({ message: 'Order not found' });
    }

    const customerOwns =
        String(order.customerId) === req.auth.userId;

    const sellerOwns =
        req.auth.role === 'seller' &&
        order.items.some(
            item => String(item.sellerId) === req.auth.userId
        );

    if (!customerOwns && !sellerOwns) {
        return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ order });
}));

// Update order status (seller only)
router.patch('/:id/status', protect, roles('seller'), asyncRoute(async (req, res) => {
    const allowed = ['confirmed', 'processing', 'shipped', 'delivered'];

    if (!allowed.includes(req.body.orderStatus)) {
        return res.status(400).json({
            message: 'Invalid order status'
        });
    }

    const order = await Order.findOne({
        _id: req.params.id,
        'items.sellerId': req.auth.userId
    });

    if (!order) {
        return res.status(404).json({
            message: 'Order not found for this seller'
        });
    }

    if (order.orderStatus === 'cancelled') {
        return res.status(409).json({
            message: 'Cancelled order cannot be updated'
        });
    }

    order.orderStatus = req.body.orderStatus;
    await order.save();

    res.json({ order });
}));

// Cancel an order and restore stock (customer only)
router.patch('/:id/cancel', protect, roles('customer'), asyncRoute(async (req, res) => {
    const session = await mongoose.startSession();
    let order;

    try {
        await session.withTransaction(async () => {
            order = await Order.findOne({
                _id: req.params.id,
                customerId: req.auth.userId
            }).session(session);

            if (!order) {
                const error = new Error('Order not found');
                error.status = 404;
                throw error;
            }

            if (['shipped', 'delivered', 'cancelled'].includes(order.orderStatus)) {
                const error = new Error(
                    'This order can no longer be cancelled'
                );
                error.status = 409;
                throw error;
            }

            for (const item of order.items) {
                await Product.updateOne(
                    { _id: item.productId },
                    { $inc: { stockQuantity: item.quantity } },
                    { session }
                );
            }

            order.orderStatus = 'cancelled';
            await order.save({ session });
        });
    } finally {
        await session.endSession();
    }

    res.json({
        message: 'Order cancelled and stock restored',
        order
    });
}));

module.exports = router;
