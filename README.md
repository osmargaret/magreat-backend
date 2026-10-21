# Ma’Great Taste Backend API

Robust REST API built with Node.js, Express, and TypeScript powering the **Ma’Great Taste** restaurant, catering, freezer stocking, and admin management platform.

## Features
- **Menu Management**: Full CRUD for restaurant dishes with category filters and tags.
- **Order Processing & Checkout**: Real-time order placement, automatic calculation, order tracking, and lifecycle status updates (`New` ➔ `Preparing` ➔ `Ready` ➔ `Delivered`).
- **Payment Gateway Integrations (Simulation)**:
  - Card verification
  - Dynamic virtual bank accounts (Providus / Wema Bank)
  - USSD string generation
  - Cash / POS on delivery
- **Blog & Culinary Stories**: Articles with view counters, markdown content, tags, and related dishes.
- **Event Catering Enquiries**: Quotations and inquiries for weddings, birthdays, and corporate events.
- **Meal Plans & Freezer Stocking**: Weekly, family, and monthly package orders.
- **Customer Messages & Inquiries**: Real-time inbox for customer communications.
- **Business Analytics**: Live revenue, order counts, top dishes, and category metrics calculated dynamically.
- **Persistent Data Storage**: JSON file-based database with automatic seed initialization.

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Development Mode
```bash
npm run dev
```
Server runs at `http://localhost:5000`.

### 3. Production Build
```bash
npm run build
npm start
```

## API Overview
- `GET /api/health` - Service health status
- `GET /api/menu` - Fetch menu items (supports `?category=` and `?search=`)
- `POST /api/menu` - Add menu item
- `PUT /api/menu/:id` - Update menu item
- `DELETE /api/menu/:id` - Delete menu item
- `GET /api/orders` - Fetch orders (supports `?status=` and `?search=`)
- `GET /api/orders/:id` - Fetch single order details
- `POST /api/orders` - Place new order
- `PATCH /api/orders/:id/status` - Update order status
- `POST /api/payments/verify` - Simulate payment verification
- `POST /api/payments/bank-transfer` - Generate virtual account for bank transfer
- `GET /api/blog` - Fetch blog articles
- `GET /api/blog/:slug` - Fetch single article
- `POST /api/blog` - Create blog post
- `GET /api/catering` - Fetch catering inquiries
- `POST /api/catering` - Submit catering quote request
- `GET /api/messages` - Fetch customer messages
- `POST /api/messages` - Submit contact message
- `GET /api/analytics` - Business performance metrics
- `POST /api/newsletter` - Subscribe to newsletter
