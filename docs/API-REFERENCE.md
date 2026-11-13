# API reference

Base URL examples below use `http://localhost:4000`. The application returns JSON for API routes. Unless otherwise stated, request localization can be selected with `X-Locale: en` or `X-Locale: ar`; `Accept-Language` is also supported.

## Health

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/health` | Public | Liveness check; does not require MongoDB. |

## Authentication — `/api/auth`

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/signup` | Public | Create an account; accepts multipart avatar upload. |
| POST | `/verify-email` | Public | Verify an email address using the emailed code. |
| POST | `/resend-verification` | Public | Resend email verification. |
| POST | `/signin` | Public | Sign in and issue session cookies. |
| POST | `/refresh-token` | Session / trusted origin | Rotate the refresh session. |
| POST | `/logout` | Session / trusted origin | Revoke the current session and clear cookies. |
| POST | `/forget-password` | Public | Start password recovery. |
| POST | `/verify-otp` | Public | Verify a password-reset code. |
| POST | `/reset-password` | Public | Set a new password after OTP verification. |
| GET | `/google` | Public, optional OAuth | Start Google OAuth. |
| GET | `/google/callback` | OAuth callback | Validate OAuth state and redirect with a one-time code. |
| POST | `/google/exchange` | Public / trusted origin | Exchange the one-time code for an HttpOnly-cookie session. |
| POST | `/socket-ticket` | Authenticated | Issue a one-time Socket.IO ticket (60-second lifetime). |

## Products — `/api/product`

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/` | Public | Search, filter, sort, and paginate products. |
| GET | `/:productId` | Public | Get product details. |
| POST | `/` | `ADMIN`, `MANAGER` | Create a product; multipart `images` upload (up to four). |
| PATCH | `/:productId` | `ADMIN`, `MANAGER` | Update product fields and/or images. |
| DELETE | `/:productId` | `ADMIN`, `MANAGER` | Delete a product. |

Catalogue query parameters include `keyword`, `gender`, `section`, `style`, `category`, `color`, `size`, `minPrice`, `maxPrice`, `sort`, `page`, `limit`, `isSale`, `inStock`, and `includeStats`. The product endpoint applies filters in MongoDB before calculating pagination totals. Search accepts Arabic and English terms and is limited to 120 characters and 16 distinct terms. Page size is capped at 60 products.

Supported sort values: `newest`, `oldest`, `price_asc`, `price_desc`, `rating`, `popular`, `name_asc`, and `name_desc`.

## Orders — `/api/order`

All order routes require authentication.

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/` | Authenticated customer | Create an order. |
| GET | `/all` | `ADMIN`, `MANAGER` | List orders for administration. |
| GET | `/:id` | Owner, `ADMIN`, `MANAGER` | Read an order. |
| GET | `/:id/invoice` | Owner, `ADMIN`, `MANAGER` | Return invoice data. |
| GET | `/:id/reorder` | Order owner | Build current cart-ready items from an earlier order. |
| PATCH | `/:id` | `ADMIN`, `MANAGER` | Update order status. |
| DELETE | `/:id` | Authenticated; ownership/status rules apply | Delete/cancel an eligible order. |

Order creation expects `orderItems` and a `shippingAddress` containing `address`, `city`, and `phone`. Each line uses a product reference, integer `quantity`, and optional `size` / `color`. Client-supplied prices are not authoritative. The server recalculates prices, validates variants, and reserves stock. An `Idempotency-Key` header may be used for safe retries.

Cash on delivery is the supported default. Card orders are rejected unless `CARD_PAYMENTS_ENABLED=true`; the repository does not currently implement a payment gateway or verified payment webhooks, so do not enable this flag in production without completing that integration.

## Administration — `/api/admin`

All routes require `ADMIN` or `MANAGER`, except the user delete/role update operations, which additionally require `ADMIN`.

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/dashboard` | `ADMIN`, `MANAGER` | Dashboard statistics. |
| GET | `/users` | `ADMIN`, `MANAGER` | List users. |
| GET | `/users/:userId` | `ADMIN`, `MANAGER` | Read a user. |
| PATCH | `/users/:userId` | `ADMIN` | Update a user's role. |
| DELETE | `/users/:userId` | `ADMIN` | Delete a user. |

## Profile — `/api/profile`

All routes require authentication.

| Method | Route | Description |
|---|---|---|
| GET | `/me` | Current user's profile. |
| PATCH | `/me/update` | Update profile; accepts a single `avatar` upload. |
| GET | `/my-orders` | Current user's orders. |
| GET | `/my-reviews` | Current user's reviews. |

## Reviews — `/api/review`

All routes require authentication. A review can be created only by a customer with a delivered order containing that product; the unique product/user index allows one review per product per user.

| Method | Route | Description |
|---|---|---|
| GET | `/` | Paginated reviews; optional `product` filter. |
| POST | `/add` | Add a review (`product`, `rating` 1–5, and `comment`). |
| DELETE | `/delete/:id` | Delete own review; `ADMIN` may delete any review. |

## Notifications — `/api/notifications`

All routes require authentication. Customers receive their own notifications; managers/admins receive management notifications.

| Method | Route | Description |
|---|---|---|
| GET | `/` | List notifications; supports `page`, `limit`, `unreadOnly`, `orderOnly`, and `keyword`. |
| PATCH | `/:id` | Mark one notification as read. |
| PATCH | `/readAll` | Mark all visible notifications as read. |

## Customer features — `/api/features`

| Method | Route | Access | Description |
|---|---|---|---|
| GET | `/recommendations` | Public; personalized when authenticated | Return in-stock recommendations. |
| POST | `/stylist` | Public | Catalogue-only styling suggestions. |
| GET | `/me?type=saved\|recent\|price-alert` | Authenticated | Read saved products, recent views, or price alerts. Omit `type` to request the supported collections. |
| POST | `/saved/:productId` | Authenticated | Save a product. |
| DELETE | `/saved/:productId` | Authenticated | Remove a saved product. |
| POST | `/recent/:productId` | Authenticated | Record a product view; newest 30 are retained. |
| POST | `/price-alerts/:productId` | Authenticated | Create/update a price alert with `targetPrice`. |
| DELETE | `/price-alerts/:productId` | Authenticated | Remove a price alert. |
| GET | `/admin/insights` | `ADMIN`, `MANAGER` | Read engagement summary statistics. |

## Common request conventions

- Browser requests must send credentials so HttpOnly session cookies are included (`credentials: "include"` with `fetch`, or `withCredentials: true` with Axios).
- Send `X-Locale: ar` or `X-Locale: en` when the UI locale is known.
- Protected routes return `401` when authentication is missing/expired, `403` for insufficient permissions or an untrusted origin, and `429` when rate-limited.
- Error responses use the shape `{ "status": "fail" | "error", "message": "...", "code": 400 }`.
- The API caps JSON bodies at 1 MB and applies route-specific upload and rate limits.
