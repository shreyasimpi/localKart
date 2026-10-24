require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./src/routes/auth');
const shopRoutes = require('./src/routes/shops');
const productRoutes = require('./src/routes/products');
const orderRoutes = require('./src/routes/orders');
const analyticsRoutes = require('./src/routes/analytics');
const { notFound, errorHandler } = require('./src/middleware/errorHandler');

const app = express();

app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173'
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30
}));

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'LocalKart API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use(notFound);
app.use(errorHandler);

async function start() {
    if (!process.env.MONGODB_URI) {
        throw new Error('Set MONGODB_URI in .env');
    }

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new Error('Set JWT_SECRET to a random string of at least 32 characters');
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const port = Number(process.env.MODULAR_PORT) || 5001;

    const server = app.listen(port, () => {
        console.log(`LocalKart modular API listening on http://localhost:${port}`);
    });

    server.on('error', error => {
        console.error('Server error:', error.message);
    });
}

start().catch(error => {
    console.error('Modular server startup failed:', error.message);
    process.exitCode = 1;
});
