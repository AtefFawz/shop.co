# Security model

This document describes the controls implemented in the current API and the operational steps required to preserve them in production. It is not a third-party penetration-test report or a guarantee that the full dependency tree is vulnerability-free.

## Authentication and sessions

- Browser sessions are stored in HttpOnly cookies; frontend JavaScript cannot read access or refresh token values.
- Access tokens expire after 15 minutes. Refresh tokens expire after seven days and rotate when refreshed.
- Refresh token hashes are stored server-side. The token version on the user record is checked on each authenticated request, allowing old sessions to be revoked.
- Production requires two different JWT signing secrets, each at least 32 characters long.
- Google OAuth is optional and uses backend-validated state plus a short-lived, single-use authorization code bound to an HttpOnly browser cookie.
- Socket.IO uses one-time, 60-second tickets. Do not put reusable tokens in URLs or query strings.

## Authorization and request origin

- Roles are `USER`, `MANAGER`, and `ADMIN`; protected routes use server-side role checks and current database role values.
- Unsafe browser requests are checked against configured trusted origins. Configure exact HTTPS frontend origins in production.
- Credentialed CORS is not configured with a wildcard origin.
- Authenticated responses are marked `Cache-Control: no-store` to prevent shared caches from retaining private account data.

## Rate limiting

Sensitive authentication, upload, admin, order, review, and notification operations use MongoDB-backed rate-limit buckets so limits are shared across application instances. A small in-memory limiter is used only as a coarse per-instance burst guard. If the shared MongoDB limiter is unavailable, protected limited operations fail closed with HTTP 503 rather than silently falling back to per-instance memory.

Place a provider-level WAF or edge rate limit in front of public production traffic as an additional layer.

## Upload validation

- Uploads are limited by file count and size (up to four product images, five MB per file).
- The middleware checks both declared MIME type and file signature for JPEG, PNG, and WebP.
- Images are stored in Cloudinary; credentials must remain server-side.
- Product updates can retain only image URLs already associated with that product. `existingImages` is limited to four entries and 2048 characters per URL.
- Newly uploaded assets are cleaned up if the request fails after upload.

## Data integrity

- Product prices and discounts are read from MongoDB during order creation; client-supplied prices are not trusted.
- Product stock reservation and order creation use a MongoDB transaction.
- `Idempotency-Key` can prevent duplicate orders after client retries.
- A review requires a delivered order containing the product; a unique index enforces one review per user/product pair.
- Product, order, and notification access is scoped to the current user unless the route explicitly grants administrator access.

## Production checklist

- [ ] Use a supported, patched Node.js 22.x release at or above the repository's `.nvmrc` value.
- [ ] Keep `.env`, deployment secrets, OAuth credentials, and Cloudinary/SMTP keys out of Git.
- [ ] Use independent high-entropy access and refresh secrets.
- [ ] Use HTTPS and exact trusted frontend origins.
- [ ] Set `TRUST_PROXY_HOPS` to the actual reverse-proxy topology.
- [ ] Use a transaction-capable MongoDB deployment and restrict database network access.
- [ ] Keep `CARD_PAYMENTS_ENABLED=false` until a real gateway and signed webhook/payment-state flow exist.
- [ ] Run `npm test` and `npm audit` as part of CI/release checks; investigate findings rather than applying force upgrades blindly.
- [ ] Keep Cloudinary and SMTP credentials in the hosting provider's secret manager.

## Known limitations

The repository's automated tests do not constitute a live integration test against a production MongoDB cluster, Cloudinary account, SMTP provider, or Google OAuth application. Dependency vulnerability status changes over time; run `npm audit` in CI and review the current advisories before deploying.
