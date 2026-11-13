# Architecture

## Overview

Shop.co API is organized as an Express application with a controller/model structure and a small service layer. The same Express app is exported for Vercel through `serverless-http`; on a regular Node.js host it starts an HTTP server and attaches Socket.IO.

## Request lifecycle

1. `shop_app.js` loads environment variables and validates critical production settings.
2. Security headers, CORS, body parsing, cookies, trusted-origin validation, Passport initialization, and locale selection are applied.
3. A coarse in-process burst limiter runs for all API requests.
4. MongoDB is connected before API routes are handled. `/health` is intentionally available without a database connection.
5. Route-level authentication, role checks, upload parsing, and shared MongoDB rate limits run before controller logic.
6. Controllers validate input and coordinate models/services. The centralized error handler returns a consistent JSON error response.

## Directory map

```text
config/          MongoDB and Google OAuth configuration
controllers/     HTTP request handlers
middlewares/     Authentication, authorization, uploads, CORS-origin and rate limits
models/          Mongoose schemas and indexes
routes/          Express route definitions
services/        Search, pricing, invoice, reorder, and product-engagement logic
scripts/         Database backfills and index creation
sockets/         Socket.IO connection lifecycle
utils/           Shared parsing, errors, localization, pagination, and helpers
tests/           Node.js test-runner suites
docs/            Maintainer and integration documentation
shop_app.js      Express application and serverless entry point
```

## Main domain flows

### Catalogue

`productController.js` validates search/filter input and composes MongoDB filters. `productSearchService.js` builds normalized Arabic/English search conditions and numeric price fields; `variantIndexService.js` prepares normalized size/color matching. Product list responses avoid populating review documents and use aggregate rating fields for catalogue cards.

Existing products need the search/price backfill before the indexed catalogue path is fully populated. New and updated products maintain the derived fields through the product controller.

### Product image updates

Uploaded images pass through the Multer middleware, which limits file size/count, checks MIME signatures, and streams accepted images to Cloudinary. When editing a product, `existingImages` may contain only images already attached to that same product. New uploads and retained images are combined and capped at four.

### Authentication

Browser sessions use HttpOnly cookies. Access tokens expire after 15 minutes; refresh tokens expire after seven days and rotate on refresh. Refresh token values are stored as hashes. The current database token version is checked on protected requests so logout, password changes, and newer logins can revoke old sessions.

Google OAuth is optional. The callback creates a short-lived, single-use authorization code; the frontend exchanges that code with a browser-bound state value. See [Frontend integration](FRONTEND-INTEGRATION.md).

### Checkout and inventory

Order prices and discounts are recalculated from MongoDB, never trusted from the browser. Stock reservation and order creation run within a MongoDB transaction. A transaction-capable MongoDB deployment (replica set or sharded cluster) is therefore required for checkout. Inventory is shared at the product level across size/color options.

An optional `Idempotency-Key` makes repeated submissions by the same user return the previously created order instead of creating another one.

### Customer engagement

`ProductEngagement` stores saved products, recent views, and price alerts. Recommendations are catalogue-driven and may use a signed-in customer's recent/saved items and non-cancelled orders. The personal stylist endpoint is catalogue-only; it does not call a third-party generative AI service.

### Real-time events

The browser requests a one-time socket ticket from `POST /api/auth/socket-ticket`. Socket.IO consumes that ticket during the connection handshake and joins the authenticated socket to the user's room. Tickets expire after 60 seconds and can be used only once. Do not pass reusable access or refresh tokens in Socket.IO query parameters.

## Roles

The role values are `USER`, `MANAGER`, and `ADMIN`.

- `USER`: customer account and personal resources.
- `MANAGER`: product/order/dashboard management and manager-scoped insights.
- `ADMIN`: manager capabilities plus user-role and account administration.

Some actions have narrower checks than the general route group; consult [API reference](API-REFERENCE.md) for the route-level summary.
