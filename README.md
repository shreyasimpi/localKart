# LocalKart Backend Starter

## Requirements
- Node.js 18+
- MongoDB local or MongoDB Atlas

## Run locally
1. Open a terminal in this folder.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set `MONGODB_URI` and set `JWT_SECRET` to a random string of at least 32 characters.
5. Run `npm run dev` (or `npm start`).
6. Open `http://localhost:5000/api/health`.

## API endpoints
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/shops`, `GET /api/shops/:id`, `POST /api/shops`, `PUT /api/shops/:id`, `DELETE /api/shops/:id`
- `GET /api/products`, `GET /api/products/:id`, `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id`
- `POST /api/orders`, `GET /api/orders/my-orders`, `GET /api/orders/seller-orders`, `GET /api/orders/:id`, `PATCH /api/orders/:id/status`, `PATCH /api/orders/:id/cancel`
- `GET /api/analytics/seller/overview`, `/api/analytics/seller/low-stock`, `/api/analytics/seller/top-products` (prefix these with `/api/analytics`)

For protected routes, add `Authorization: Bearer YOUR_JWT_TOKEN`.

## Example requests
Register seller:
```json
{"name":"Demo Seller","email":"seller@example.com","password":"ChangeMe123!","phone":"9999999999","role":"seller"}
```
Login:
```json
{"email":"seller@example.com","password":"ChangeMe123!"}
```
Create shop (seller token):
```json
{"shopName":"City Gifts","description":"Gifts and stationery","category":"Gifts","address":"12 Market Road","city":"Bengaluru","area":"Jayanagar","contactNumber":"9999999999"}
```
Create product (seller token; use your shop `_id`):
```json
{"shopId":"YOUR_SHOP_ID","name":"Notebook","description":"A5 ruled notebook","category":"Stationery","price":80,"stockQuantity":20,"tags":["study","paper"]}
```
Register/login a customer, then place an order using an actual product ID:
```json
{"items":[{"productId":"YOUR_PRODUCT_ID","quantity":2}],"deliveryAddress":"Demo address, Bengaluru","paymentMethod":"COD"}
```

## Important limitations
- Order placement/cancellation uses MongoDB transactions. Transactions require a replica set; MongoDB Atlas supports this. A standalone local MongoDB instance may reject transaction operations unless configured as a replica set.
- `ONLINE` is only a placeholder; it does not charge payments. Integrate a payment provider before accepting real online payments.
- This starter includes auth, shops, products, orders and basic seller analytics. It does not yet include AI endpoints, reviews, wishlist, or cloud image-upload implementation.
- For simplicity, a multi-seller order has one overall status. Production systems should track fulfilment status per seller.
- This is a hackathon starter; test and review it before public deployment.
