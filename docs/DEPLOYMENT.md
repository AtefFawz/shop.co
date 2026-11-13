# Configuration and deployment

## Environment variables

Copy `.env.example` to `.env` for local development. The example contains placeholders only; replace them with local or provider-issued values.

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | Recommended | Set to `development` locally and `production` in deployment. |
| `PORT` | No | HTTP port; defaults to `4000` on a Node host. |
| `URL` | Yes | MongoDB connection string. |
| `MONGO_MAX_POOL_SIZE` | No | MongoDB connection pool size; defaults to `10`. |
| `SECRET_ACCESS_KEY` | Yes | Access-token signing secret; at least 32 characters in production. |
| `REFRESH_SECRET` | Yes | Different refresh-token signing secret; at least 32 characters in production. |
| `CLIENT_URL` | Yes in production | Primary frontend origin; also used for OAuth redirects. |
| `FRONTEND_URL` | No | Additional trusted frontend origin. |
| `CORS_ORIGINS` | No | Comma-separated additional frontend origins. |
| `TRUST_PROXY_HOPS` | Yes in production | Number of trusted reverse-proxy hops, integer 1–5. Set it to match the actual deployment path. |
| `CLOUDINARY_CLOUD_NAME` | For uploads | Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | For uploads | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | For uploads | Cloudinary API secret. |
| `SMTP_HOST` | For email | SMTP hostname; defaults to `smtp.gmail.com`. |
| `SMTP_PORT` | For email | SMTP port; defaults to `587`. |
| `SMTP_SECURE` | For email | Set `true` when the SMTP provider requires implicit TLS. |
| `SMTP_USER` / `SMTP_PASS` | For email | SMTP credentials. |
| `SMTP_FROM` | No | Sender address; defaults to a Shop.co Security sender based on `SMTP_USER`. |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth client secret. |
| `GOOGLE_CALLBACK_URL` | Optional | Backend OAuth callback URL; configure all three Google values together. |
| `CARD_PAYMENTS_ENABLED` | Keep `false` | Card order submission is rejected unless explicitly enabled; no gateway is implemented yet. Do not enable without a complete payment integration. |

In production, `CLIENT_URL`, `FRONTEND_URL`, and every entry in `CORS_ORIGINS` must be HTTPS origins without a path, query, or fragment. Use exact origins rather than wildcard entries. The production startup check requires at least one configured frontend origin.

Generate independent JWT secrets:

```bash
openssl rand -base64 48
```

## Standard Node.js deployment

1. Provision MongoDB with transaction support and create the database/user.
2. Provision Cloudinary and SMTP if the corresponding features will be used.
3. Set environment variables in the hosting provider's secret manager.
4. Install from the lockfile and start the service:

```bash
npm ci
npm start
```

The server listens on `0.0.0.0:$PORT` and defaults to port `4000`.

## Vercel deployment

The repository contains `vercel.json` and exports a `serverless-http` handler from `shop_app.js`. Configure the same environment variables in the Vercel project settings. `VERCEL=1` is provided by Vercel; the application avoids opening a local listener in that environment.

Socket.IO behavior should be validated against the selected hosting plan/runtime. Do not assume persistent WebSocket connections are available in every serverless deployment configuration; use a host that supports the required connection lifecycle if persistent real-time connections are a production requirement.

## Database maintenance and indexes

### Existing product catalogue

Run once when deploying the indexed search and numeric-price fields to a database containing older product documents:

```bash
npm run db:backfill-products
```

This streams products in batches, writes normalized search/filter/variant/price fields, and ensures declared model indexes. It may consume database resources; schedule it during a maintenance window for a large catalogue. The script also removes one known legacy text index if present. Review the script before running it against an unfamiliar database.

### Customer feature indexes

Run after deploying schema changes for saved products, price alerts, order idempotency, notification TTL, or review uniqueness:

```bash
npm run db:features-indexes
```

The script is intended to be safe to re-run. If creation of the unique product/user review index fails due to duplicate existing reviews, identify and resolve those duplicates before retrying.

## Deployment verification

- `GET /health` returns HTTP 200.
- Sign-up/sign-in, email verification, refresh, and logout work with the configured cookie domain and HTTPS settings.
- Frontend requests include credentials and use a trusted origin.
- Product image upload and update work with Cloudinary credentials.
- Checkout works against transaction-capable MongoDB and stock is decremented exactly once for an idempotent retry.
- Admin routes reject non-admin/manager accounts.
- `npm test` passes in the deployed code revision before release.
