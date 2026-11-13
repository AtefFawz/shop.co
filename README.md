# Shop.co API

A REST API for the Shop.co e-commerce platform, built with Node.js, Express, MongoDB, and Mongoose. It supports the storefront, customer accounts, checkout, product administration, reviews, notifications, and real-time order updates.

## Highlights

- Product catalogue with Arabic and English search, filtering, sorting, and database pagination.
- Customer authentication with email verification, password reset, rotating refresh sessions, and optional Google OAuth.
- Product and variant validation, Cloudinary image uploads, and role-protected administration.
- Transactional order creation with server-side pricing, stock reservation, idempotency support, and order history.
- Customer features including saved products, recent views, price alerts, and catalogue-based recommendations.
- Reviews restricted to customers with a delivered order containing the reviewed product.
- User-scoped notifications and Socket.IO events.
- Shared MongoDB-backed rate limits for sensitive endpoints.

## Technology

| Area | Implementation |
|---|---|
| Runtime | Node.js 22.23.5+ |
| HTTP API | Express 5 |
| Database | MongoDB with Mongoose |
| Authentication | JWT in HttpOnly cookies, refresh-token rotation, optional Google OAuth |
| Image storage | Cloudinary |
| Real-time events | Socket.IO |
| Email | Nodemailer / SMTP |
| Tests | Node.js built-in test runner |
| Deployment | Vercel serverless handler or a Node.js host |

## Getting started

### Requirements

- Node.js `22.23.5` or newer (the repository includes an `.nvmrc`).
- npm.
- A MongoDB database. Use a replica-set deployment for transactional order creation; MongoDB Atlas is a straightforward option.
- Cloudinary credentials for image upload features.
- SMTP credentials for email verification and password reset.

### Install and configure

```bash
git clone https://github.com/AtefFawz/shop-co.git
cd shop-co
nvm install
nvm use
npm ci
cp .env.example .env
```

Edit `.env` and provide the required MongoDB URL, two different JWT secrets, and the frontend origin. Configure Cloudinary and SMTP before testing image uploads or email flows. Google OAuth is optional; leave its three variables empty to disable it.

Generate independent JWT secrets with:

```bash
openssl rand -base64 48
```

### Run locally

```bash
npm run dev
```

The API listens on `http://localhost:4000` by default. Check `http://localhost:4000/health` for a lightweight liveness response.

### Run tests

```bash
npm test
```

## Documentation

- [Architecture and request lifecycle](docs/ARCHITECTURE.md)
- [API route reference](docs/API-REFERENCE.md)
- [Frontend integration](docs/FRONTEND-INTEGRATION.md)
- [Configuration and deployment](docs/DEPLOYMENT.md)
- [Security model and operational checklist](docs/SECURITY.md)

## Operational notes

- Run `npm run db:backfill-products` once when upgrading an existing database to the indexed catalogue search and price fields. See the deployment guide before running it.
- Run `npm run db:features-indexes` after deploying schema/index changes for customer engagement features. It is safe to re-run, but it may fail if duplicate reviews already violate the new unique index; resolve those duplicates before retrying.
- Card checkout is disabled by default. Do not set `CARD_PAYMENTS_ENABLED=true` until a real payment provider, webhook verification, and payment-state handling have been implemented.
- Product inventory is tracked at product level, not independently for each size/color variant.

## License

ISC (as declared in `package.json`).
