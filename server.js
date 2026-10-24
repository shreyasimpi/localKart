require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, default: '' },
  role: { type: String, enum: ['seller', 'customer'], required: true }
}, { timestamps: true });
const shopSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopName: { type: String, required: true, trim: true }, description: { type: String, default: '' },
  category: { type: String, required: true }, address: { type: String, required: true },
  city: { type: String, required: true }, area: { type: String, default: '' },
  contactNumber: { type: String, default: '' }, logoUrl: { type: String, default: '' }, isActive: { type: Boolean, default: true }
}, { timestamps: true });
const productSchema = new mongoose.Schema({
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
  name: { type: String, required: true, trim: true }, description: { type: String, default: '' },
  category: { type: String, required: true }, price: { type: Number, required: true, min: 0 },
  stockQuantity: { type: Number, required: true, min: 0, validate: Number.isInteger },
  imageUrl: { type: String, default: '' }, tags: [{ type: String }], isActive: { type: Boolean, default: true }
}, { timestamps: true });
const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productName: { type: String, required: true }, quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 }, subtotal: { type: Number, required: true, min: 0 }
}, { _id: false });
const orderSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  items: { type: [orderItemSchema], required: true }, totalAmount: { type: Number, required: true, min: 0 },
  deliveryAddress: { type: String, required: true }, paymentMethod: { type: String, enum: ['COD', 'ONLINE'], default: 'COD' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  orderStatus: { type: String, enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'], default: 'pending' }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);
const Shop = mongoose.model('Shop', shopSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);

function asyncRoute(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
function protect(req, res, next) {
  const token = (req.headers.authorization || '').startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try { req.auth = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { return res.status(401).json({ message: 'Invalid or expired token' }); }
}
const roles = (...allowed) => (req, res, next) => allowed.includes(req.auth.role) ? next() : res.status(403).json({ message: 'Permission denied' });
async function currentUser(req) { return User.findById(req.auth.userId).select('-passwordHash'); }
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'LocalKart API' }));

// AUTH
app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { name, email, password, phone = '', role } = req.body;
  if (!name || !email || !password || !['seller', 'customer'].includes(role)) return res.status(400).json({ message: 'name, email, password and role (seller/customer) are required' });
  if (String(password).length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  const user = await User.create({ name, email, phone, role, passwordHash: await bcrypt.hash(password, 12) });
  res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
}));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || '').toLowerCase() }).select('+passwordHash');
  if (!user || !password || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ message: 'Invalid email or password' });
  const token = jwt.sign({ userId: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
}));
app.get('/api/auth/me', protect, asyncRoute(async (req, res) => res.json({ user: await currentUser(req) })));

// SHOPS
app.get('/api/shops', asyncRoute(async (req, res) => {
  const filter = { isActive: true };
  for (const key of ['city', 'area', 'category']) if (req.query[key]) filter[key] = new RegExp(String(req.query[key]).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&'), 'i');
  res.json({ shops: await Shop.find(filter).sort({ createdAt: -1 }).limit(100) });
}));
app.get('/api/shops/:id', asyncRoute(async (req, res) => {
  const shop = await Shop.findOne({ _id: req.params.id, isActive: true });
  if (!shop) return res.status(404).json({ message: 'Shop not found' }); res.json({ shop });
}));
app.post('/api/shops', protect, roles('seller'), asyncRoute(async (req, res) => {
  const { shopName, description, category, address, city, area, contactNumber, logoUrl } = req.body;
  if (!shopName || !category || !address || !city) return res.status(400).json({ message: 'shopName, category, address and city are required' });
  const shop = await Shop.create({ ownerId: req.auth.userId, shopName, description, category, address, city, area, contactNumber, logoUrl });
  res.status(201).json({ shop });
}));
app.put('/api/shops/:id', protect, roles('seller'), asyncRoute(async (req, res) => {
  const fields = ['shopName','description','category','address','city','area','contactNumber','logoUrl']; const updates = {};
  fields.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  const shop = await Shop.findOneAndUpdate({ _id: req.params.id, ownerId: req.auth.userId }, updates, { new: true, runValidators: true });
  if (!shop) return res.status(404).json({ message: 'Shop not found or not yours' }); res.json({ shop });
}));
app.delete('/api/shops/:id', protect, roles('seller'), asyncRoute(async (req, res) => {
  const shop = await Shop.findOneAndUpdate({ _id: req.params.id, ownerId: req.auth.userId }, { isActive: false }, { new: true });
  if (!shop) return res.status(404).json({ message: 'Shop not found or not yours' }); res.json({ message: 'Shop deactivated' });
}));

// PRODUCTS
app.get('/api/products', asyncRoute(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.category) filter.category = new RegExp(String(req.query.category), 'i');
  if (req.query.shopId) filter.shopId = req.query.shopId;
  if (req.query.sellerId) filter.sellerId = req.query.sellerId;
  if (req.query.q) filter.$or = [{ name: new RegExp(String(req.query.q), 'i') }, { description: new RegExp(String(req.query.q), 'i') }, { tags: new RegExp(String(req.query.q), 'i') }];
  if (req.query.minPrice !== undefined || req.query.maxPrice !== undefined) { filter.price = {}; if (req.query.minPrice !== undefined) filter.price.$gte = Math.max(0, Number(req.query.minPrice)); if (req.query.maxPrice !== undefined) filter.price.$lte = Math.max(0, Number(req.query.maxPrice)); }
  const page = Math.max(1, Number.parseInt(req.query.page) || 1), limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit) || 12));
  const sort = req.query.sort === 'price_asc' ? { price: 1 } : req.query.sort === 'price_desc' ? { price: -1 } : { createdAt: -1 };
  const [products, total] = await Promise.all([Product.find(filter).populate('shopId', 'shopName city area').sort(sort).skip((page - 1) * limit).limit(limit), Product.countDocuments(filter)]);
  res.json({ products, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));
app.get('/api/products/:id', asyncRoute(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, isActive: true }).populate('shopId', 'shopName city area');
  if (!product) return res.status(404).json({ message: 'Product not found' }); res.json({ product });
}));
app.post('/api/products', protect, roles('seller'), asyncRoute(async (req, res) => {
  const { shopId, name, description, category, price, stockQuantity, imageUrl, tags = [] } = req.body;
  if (!shopId || !name || !category || price === undefined || stockQuantity === undefined) return res.status(400).json({ message: 'shopId, name, category, price and stockQuantity are required' });
  if (!Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(stockQuantity)) || Number(stockQuantity) < 0) return res.status(400).json({ message: 'Price must be non-negative and stock must be a non-negative integer' });
  const shop = await Shop.findOne({ _id: shopId, ownerId: req.auth.userId, isActive: true });
  if (!shop) return res.status(403).json({ message: 'Use your own active shop ID' });
  const product = await Product.create({ sellerId: req.auth.userId, shopId, name, description, category, price: Number(price), stockQuantity: Number(stockQuantity), imageUrl, tags: Array.isArray(tags) ? tags : [] });
  res.status(201).json({ product });
}));

app.put('/api/products/:id', protect, roles('seller'), asyncRoute(async (req, res) => {
  const fields = ['name', 'description', 'category', 'price', 'stockQuantity', 'imageUrl', 'tags', 'isActive'];
  const updates = {};

  fields.forEach(k => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });

  if (updates.price !== undefined) {
    updates.price = Number(updates.price);
    if (!Number.isFinite(updates.price) || updates.price < 0) {
      return res.status(400).json({ message: 'Invalid price' });
    }
  }

  if (updates.stockQuantity !== undefined) {
    updates.stockQuantity = Number(updates.stockQuantity);
    if (!Number.isInteger(updates.stockQuantity) || updates.stockQuantity < 0) {
      return res.status(400).json({ message: 'Stock must be a non-negative integer' });
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
    return res.status(404).json({ message: 'Product not found or not yours' });
  }

  res.json({ product });
}));
app.delete('/api/products/:id', protect, roles('seller'), asyncRoute(async (req, res) => {
  const product = await Product.findOneAndUpdate({ _id: req.params.id, sellerId: req.auth.userId }, { isActive: false }, { new: true });
  if (!product) return res.status(404).json({ message: 'Product not found or not yours' }); res.json({ message: 'Product deactivated' });
}));

// ORDERS: MongoDB transactions require a replica set (e.g. MongoDB Atlas).
app.post('/api/orders', protect, roles('customer'), asyncRoute(async (req, res) => {
  const { items, deliveryAddress, paymentMethod = 'COD' } = req.body;
  if (!Array.isArray(items) || !items.length || !deliveryAddress) return res.status(400).json({ message: 'items and deliveryAddress are required' });
  if (!['COD','ONLINE'].includes(paymentMethod)) return res.status(400).json({ message: 'paymentMethod must be COD or ONLINE' });
  const quantities = new Map();
  for (const item of items) { const id = String(item.productId || ''), qty = Number(item.quantity); if (!mongoose.isValidObjectId(id) || !Number.isInteger(qty) || qty < 1) return res.status(400).json({ message: 'Each item needs a valid productId and positive integer quantity' }); quantities.set(id, (quantities.get(id) || 0) + qty); }
  const session = await mongoose.startSession(); let order;
  try { await session.withTransaction(async () => {
    const orderItems = []; let total = 0;
    for (const [id, qty] of quantities) {
      const p = await Product.findOneAndUpdate({ _id: id, isActive: true, stockQuantity: { $gte: qty } }, { $inc: { stockQuantity: -qty } }, { new: true, session });
      if (!p) { const e = new Error('A product is unavailable or does not have enough stock'); e.status = 409; throw e; }
      const subtotal = Number((p.price * qty).toFixed(2)); total += subtotal;
      orderItems.push({ productId: p._id, sellerId: p.sellerId, productName: p.name, quantity: qty, unitPrice: p.price, subtotal });
    }
    const docs = await Order.create([{ customerId: req.auth.userId, items: orderItems, totalAmount: Number(total.toFixed(2)), deliveryAddress, paymentMethod }], { session }); order = docs[0];
  }); } finally { await session.endSession(); }
  res.status(201).json({ message: 'Order placed', order });
}));
app.get('/api/orders/my-orders', protect, roles('customer'), asyncRoute(async (req, res) => res.json({ orders: await Order.find({ customerId: req.auth.userId }).sort({ createdAt: -1 }) })));
app.get('/api/orders/seller-orders', protect, roles('seller'), asyncRoute(async (req, res) => res.json({ orders: await Order.find({ 'items.sellerId': req.auth.userId }).sort({ createdAt: -1 }) })));
app.get('/api/orders/:id', protect, asyncRoute(async (req, res) => {
  const order = await Order.findById(req.params.id); if (!order) return res.status(404).json({ message: 'Order not found' });
  const customerOwns = String(order.customerId) === req.auth.userId;
  const sellerOwns = req.auth.role === 'seller' && order.items.some(i => String(i.sellerId) === req.auth.userId);
  if (!customerOwns && !sellerOwns) return res.status(403).json({ message: 'Access denied' }); res.json({ order });
}));
app.patch('/api/orders/:id/status', protect, roles('seller'), asyncRoute(async (req, res) => {
  const allowed = ['confirmed','processing','shipped','delivered']; if (!allowed.includes(req.body.orderStatus)) return res.status(400).json({ message: 'Invalid order status' });
  const order = await Order.findOne({ _id: req.params.id, 'items.sellerId': req.auth.userId });
  if (!order) return res.status(404).json({ message: 'Order not found for this seller' });
  if (order.orderStatus === 'cancelled') return res.status(409).json({ message: 'Cancelled order cannot be updated' });
  order.orderStatus = req.body.orderStatus; await order.save(); res.json({ order });
}));
app.patch('/api/orders/:id/cancel', protect, roles('customer'), asyncRoute(async (req, res) => {
  const session = await mongoose.startSession(); let order;
  try { await session.withTransaction(async () => {
    order = await Order.findOne({ _id: req.params.id, customerId: req.auth.userId }).session(session);
    if (!order) { const e = new Error('Order not found'); e.status = 404; throw e; }
    if (['shipped','delivered','cancelled'].includes(order.orderStatus)) { const e = new Error('This order can no longer be cancelled'); e.status = 409; throw e; }
    for (const item of order.items) await Product.updateOne({ _id: item.productId }, { $inc: { stockQuantity: item.quantity } }, { session });
    order.orderStatus = 'cancelled'; await order.save({ session });
  }); } finally { await session.endSession(); }
  res.json({ message: 'Order cancelled and stock restored', order });
}));

// SELLER ANALYTICS
app.get('/api/analytics/seller/overview', protect, roles('seller'), asyncRoute(async (req, res) => {
  const [activeProducts, orders] = await Promise.all([Product.countDocuments({ sellerId: req.auth.userId, isActive: true }), Order.find({ 'items.sellerId': req.auth.userId, orderStatus: { $ne: 'cancelled' } }).select('items')]);
  const sales = orders.reduce((sum, o) => sum + o.items.filter(i => String(i.sellerId) === req.auth.userId).reduce((s, i) => s + i.subtotal, 0), 0);
  res.json({ activeProducts, orderCount: orders.length, sales: Number(sales.toFixed(2)) });
}));
app.get('/api/analytics/seller/low-stock', protect, roles('seller'), asyncRoute(async (req, res) => {
  const threshold = Math.max(0, Number(process.env.LOW_STOCK_THRESHOLD) || 5);
  res.json({ threshold, products: await Product.find({ sellerId: req.auth.userId, isActive: true, stockQuantity: { $lte: threshold } }).sort({ stockQuantity: 1 }) });
}));
app.get('/api/analytics/seller/top-products', protect, roles('seller'), asyncRoute(async (req, res) => {
  const orders = await Order.find({ 'items.sellerId': req.auth.userId, orderStatus: { $ne: 'cancelled' } }).select('items'); const map = {};
  for (const o of orders) for (const i of o.items) if (String(i.sellerId) === req.auth.userId) { const id = String(i.productId); map[id] ||= { productId: id, name: i.productName, quantitySold: 0, revenue: 0 }; map[id].quantitySold += i.quantity; map[id].revenue += i.subtotal; }
  res.json({ products: Object.values(map).sort((a,b) => b.quantitySold - a.quantitySold).slice(0,10) });
}));

app.use((req, res) => res.status(404).json({ message: 'Endpoint not found' }));
app.use((err, req, res, next) => {
  console.error(err.message);
  if (err.name === 'ValidationError') return res.status(400).json({ message: 'Validation failed', details: err.message });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid ID format' });
  if (err.code === 11000) return res.status(409).json({ message: 'Email or unique value already exists' });
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Internal server error' });
});

async function start() {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in .env');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Set JWT_SECRET to a random string of at least 32 characters');
  await mongoose.connect(process.env.MONGODB_URI);
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`LocalKart API listening on http://localhost:${port}`));
}
start().catch(err => { console.error('Startup failed:', err.message); process.exit(1); });
