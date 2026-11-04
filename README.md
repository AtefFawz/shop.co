# Shop.co API

A bilingual Node.js / Express / MongoDB REST API for the Shop.co storefront and administration dashboard.

## What changed in this revision

- Server-side product search, filtering, sorting, and pagination now share one MongoDB filter. The pagination total always represents the filtered result set.
- Search supports Arabic and English, Arabic diacritics and common letter variants, one-character queries, partial words, and multi-word queries.
- Product search uses precomputed, indexed prefixes and n-grams rather than an unbounded regular-expression scan for every keystroke. A backfill script builds the indexes for existing products. Numeric base/effective price mirrors keep price filtering and sorting consistent with displayed sale pricing.
- Product list queries no longer populate review documents. Cards use `ratingsAverage` and `ratingsQuantity`; product details return the latest 20 reviews, and the reviews endpoint remains paginated.
- Added internal indexed base/effective price mirrors (`priceValue` and `salePriceValue`) while keeping the original `price` string in the API and database for compatibility. `minPrice`, `maxPrice`, and price sorting use the displayed sale price when a product is on sale.
- Order items now preserve the selected `size` and `color`. The API validates them against the product's available options, combines stock reservations per product, and calculates every line price and the order total from the database.
- Renamed the model directory from `modules/` to the conventional `models/`. Mongoose model names such as `product`, `order`, and `user` remain unchanged.

## Requirements

- Node.js 22.13.0 or newer (recommended: a currently supported LTS line).
- MongoDB (MongoDB Atlas is recommended for production).
- Cloudinary credentials for image uploads.
- SMTP credentials for password-reset emails.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Configure `URL`, Cloudinary, SMTP, and two different JWT secrets in `.env`. Each JWT secret must contain at least 32 characters. Generate secrets with:

```bash
openssl rand -base64 48
```

Do not commit `.env`.

## Existing database migration

Before using the optimized catalog search and price sorting in production, run this once against the target database:

```bash
npm run db:backfill-products
```

The script streams products in batches, writes internal search fields plus numeric base/effective price values, then creates the declared Product, Order, Review, Notification, User, OTP, OAuth-code, shared rate-limit bucket, and socket-ticket indexes. It does not change the public product `price` field or rename any established MongoDB collection/model. Run it during a maintenance window for a large catalog because index creation can consume database resources.

Until the backfill is complete, legacy product documents still use a compatibility search branch, but it is slower. The new create/update product endpoints maintain the search and numeric-price fields automatically.

## Product catalog API

### Search, filters, sorting, and pagination

```http
GET /api/product?keyword=shirt&gender=Men&section=Casual&style=Oversized&maxPrice=1500&sort=price_asc&page=1&limit=12
GET /api/product?keyword=%D9%82%D9%85%D9%8A%D8%B5&gender=رجالي&maxPrice=2000&sort=newest&page=1&limit=12
```

Supported query parameters:

| Parameter | Behavior |
|---|---|
| `keyword` | Arabic/English product search. Accepts a single character, a partial word, a full word, or multiple words (up to 120 characters and 16 distinct terms). |
| `gender` | Exact, case-insensitive match across `gender`, `genderAr`, and `genderEn`. |
| `section` | Exact match across `section`, `sectionAr`, and `sectionEn`. |
| `style` | Exact match across `style`, `styleAr`, and `styleEn`. |
| `category` | Exact match across `category`, `categoryAr`, and `categoryEn`. |
| `minPrice` | Inclusive numeric minimum displayed price, after an active sale discount. |
| `maxPrice` | Inclusive numeric maximum displayed price, after an active sale discount. |
| `sort` | `newest`, `oldest`, `price_asc`, `price_desc`, `rating`, `popular`, `name_asc`, or `name_desc`. Price sorting uses the displayed price after an active sale discount. Price aliases `price-low-to-high` and `price-high-to-low` are also accepted. |
| `isSale` | `true` or `false`. |
| `inStock` | `true` for available products, `false` for zero stock. |
| `page` | One-based page number. |
| `limit` | Page size, capped at 60 for the product catalog. |
| `includeStats` | Pass `true` only when catalog-wide sale/stock counts are needed. Omitted by default to keep storefront searches lightweight. |

`gender`, `section`, `style`, and `category` accept comma-separated values, for example `gender=Men,Women`. When more than one filter is supplied, all filters are applied together. `keyword` terms are combined with AND semantics, so a multi-word query must match every term somewhere in the searchable product fields.

The response retains the established `data.Products` shape and includes `pagination.total`, `page`, `limit`, `totalPages`, `hasNextPage`, and `hasPreviousPage`. The total count is calculated using the exact same filters as the product page.

### Search behavior and frontend integration

The search index is language-aware and normalizes Arabic diacritics, tatweel, and common Alef/Ya variants. It indexes product names, descriptions, categories, sections, styles, and gender fields. Partial matching uses indexed n-grams, so a query can match the middle of a word as well as its beginning. A one-character query is supported and can be broad by nature. Queries are limited to 120 characters and 16 distinct terms to bound database query complexity.

For the frontend:

1. Debounce search input by roughly 250–350 ms; do not send a request for every keystroke immediately.
2. Send `keyword`, active filters, `sort`, `page`, and `limit` together on every catalog request.
3. Reset `page` to `1` whenever the keyword, a filter, or sort changes.
4. Use `pagination.total` and `pagination.totalPages` from the response; do not paginate only the currently loaded products.
5. Cancel or ignore stale requests when a newer search value has already been entered.
6. Send `includeStats=true` only on a screen that actually displays catalog-wide stock/sale counts.

Product list responses intentionally do not populate review documents. Use the product's `ratingsAverage` and `ratingsQuantity` for cards. Product details include the latest 20 reviews; use the paginated endpoint `GET /api/review?product=<productId>&page=1&limit=10` to load more.

## Orders API

### Create order

```http
POST /api/order
Content-Type: application/json
Authorization: Bearer <accessToken>
```

```json
{
  "orderItems": [
    {
      "productId": "PRODUCT_OBJECT_ID",
      "quantity": 2,
      "size": "M",
      "color": "Black"
    }
  ],
  "shippingAddress": {
    "address": "Street and building",
    "city": "Cairo",
    "phone": "+201000000000"
  }
}
```

`productId` may also be sent as `product`. `size` and `color` are optional for backward compatibility; when sent, each value must match one of the product's configured `size` or `colors` options. The selected values are saved as order-time snapshots, so they remain visible even if product options change later.

Do not trust or calculate prices in the browser. The API ignores any client-supplied item price, reads the current product price and discount from MongoDB, calculates the unit price and `totalPrice`, then reserves stock atomically per product. If order creation fails after a reservation, the service attempts to restore the reserved quantities. Stock is currently tracked at product level, not separately for each size/color combination.

### Order frontend payload

Keep the cart's selected product variant with each cart line and send it as `size` and `color` when creating the order. The backend response returns these fields on every `orderItems[]` entry. Display the returned `price` and `totalPrice` from the server response rather than trusting a previously cached cart price.

## API language

Choose the response language per request:

```http
GET /api/product?lang=ar
Accept-Language: ar-EG
X-Locale: ar
```

Arabic and English product fields are optional. Supported fields include `nameAr` / `nameEn`, `descriptionAr` / `descriptionEn`, `categoryAr` / `categoryEn`, `sectionAr` / `sectionEn`, `styleAr` / `styleEn`, and `genderAr` / `genderEn`. Existing `name`, `description`, `price`, and model names are preserved.

## Project structure

```text
config/          Database and Passport configuration
controllers/     HTTP controllers
middlewares/     Authentication, upload, locale, security, and rate limiting
models/          Mongoose schemas and models
routes/          Express route definitions
services/        Reusable business logic (catalog search/filter/variant indexing)
scripts/         Operational database scripts and backfills
sockets/         Socket.IO setup
utils/           Shared helpers, errors, i18n, pagination, and notifications
tests/           Node test-runner unit tests
```

This is a conventional Express MVC structure with a small service layer. Controllers handle HTTP concerns, models own persistence/index definitions, and services contain reusable search/index logic. External route prefixes and established Mongoose model names have not changed.

## Security and production notes

- Access and refresh tokens are held in HTTP-only, `SameSite=Lax` cookies. Access tokens expire after 15 minutes; refresh tokens rotate and are stored as hashes. Sign-in increments a database-backed token version atomically, making the newest login the only active session for that account. Logout, password reset, and role changes revoke sessions and disconnect the user's sockets.
- Google OAuth validates its backend `state` cookie and a second browser-bound, HTTP-only client-state cookie. The callback creates a 60-second, single-use authorization code bound to that browser nonce; the access token is never placed in a URL or JSON response.
- Unsafe browser requests require an allow-listed HTTPS `Origin`; `CLIENT_URL`, `FRONTEND_URL`, and `CORS_ORIGINS` must be exact production origins. Same-origin storefront rewrites are the supported browser integration path. Bearer-only native/server clients remain supported without browser cookies.
- Product upload routes use Multer 2.5.0 or newer, synchronous file filtering, bounded multipart fields/parts/depth, file-size limits, signature validation, and shared upload rate limits.
- Authentication and upload rate limits use atomic MongoDB buckets shared across instances. If the shared store fails, protected requests fail closed with 503 rather than silently falling back to per-instance counters. A coarse in-memory global burst limit is additional protection, not the security limit.
- API security headers, bounded request bodies, trusted-origin checks, centralized error handling, and production startup validation for JWT secrets, HTTPS origins, Google OAuth configuration, and trusted proxy hops are enabled.
- Socket.IO authenticates with a 60-second, single-use, hashed database ticket issued by `/api/auth/socket-ticket`; the browser never receives the reusable API JWT.
- Socket.IO requires a long-running server. Vercel Functions do not provide a persistent WebSocket server; deploy Socket.IO separately or use a managed realtime provider when live notifications are required.

## Tests

```bash
npm test
```

The automated tests cover localization, search normalization/index construction, partial and multi-word search filters, safe filter construction, pagination, and numeric-price validation. A live MongoDB/Cloudinary/SMTP integration environment is still required to run end-to-end service tests.

## Main endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Create customer account |
| POST | `/api/auth/signin` | Login |
| POST | `/api/auth/refresh-token` | Rotate refresh token |
| POST | `/api/auth/google/exchange` | Exchange a short-lived Google authorization code |
| POST | `/api/auth/logout` | Revoke refresh token |
| POST | `/api/auth/forget-password` | Request password OTP |
| POST | `/api/auth/verify-otp` | Validate password OTP |
| POST | `/api/auth/reset-password` | Set a new password |
| GET | `/api/product` | Search/filter/sort/paginate products |
| GET | `/api/product/:productId` | Product details and latest reviews |
| POST | `/api/order` | Create order with server-calculated prices |
| GET | `/api/profile/me` | Current user |
| GET | `/api/notifications` | Current user's notifications |
| GET | `/health` | Liveness check |

## ملخص بالعربي

- البحث في المنتجات أصبح يدعم العربي والإنجليزي، والحرف الواحد، وجزء الكلمة، والكلمة الكاملة، وعدة كلمات معًا.
- الفلاتر `gender` و`section` و`style` و`category` تعمل من قاعدة البيانات، وتدعم القيم العربية والإنجليزية والقيم المتعددة المفصولة بفواصل.
- يدعم endpoint المنتجات `minPrice` و`maxPrice` و`sort` و`page` و`limit`، ويتم حساب إجمالي النتائج بعد تطبيق كل الفلاتر.
- لتحديث فهارس المنتجات القديمة شغّل `npm run db:backfill-products` مرة واحدة مع ضبط متغير `URL`.
- الطلب يقبل `size` و`color` داخل كل عنصر في `orderItems`. يتم التحقق من توافر الاختيار داخل إعدادات المنتج، وحساب السعر والخصم والإجمالي من قاعدة البيانات، وليس من الفرونت إند.
- المخزون ما زال محسوبًا على مستوى المنتج بالكامل، وليس لكل مقاس أو لون بصورة مستقلة.
- تم نقل ملفات `modules/` إلى `models/` مع الحفاظ على أسماء الـ Mongoose models ومسارات الـ API.

## License

ISC


## Security baseline

- Node.js 22.13.0+; Multer 2.5.0+, Express 5.3.x, Mongoose 9.11.4+, Socket.IO 4.8.4.
- Browser sessions use HttpOnly cookies; unsafe browser requests must match an exact trusted Origin.
- Sensitive rate limits use shared MongoDB buckets; run `npm run db:backfill-products` after deployment to ensure TTL indexes.
- Review `SECURITY-SETUP-AR.md` and run `npm audit` after generating the lockfile.

- Shared per-account limits are applied to admin reads/writes, order mutations, review writes, notification mutations, and file uploads.
- Place a WAF / edge rate limit in front of public traffic; the in-process global limiter is only a burst guard.
