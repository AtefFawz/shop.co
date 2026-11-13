# Frontend integration

This document describes the browser-facing conventions the Shop.co frontend should follow.

## Base URL and cookies

Set one environment variable in the frontend for the API origin, for example `NEXT_PUBLIC_API_URL=http://localhost:4000` during local development. Keep production API and frontend origins on HTTPS.

Browser API calls must include cookies:

```ts
const response = await fetch(`${API_URL}/api/profile/me`, {
  credentials: "include",
  headers: { "X-Locale": locale },
});
```

With Axios, configure `withCredentials: true`. Do not attempt to read the access or refresh tokens from JavaScript; both are HttpOnly cookies. Protected endpoints can also accept a Bearer access token for integrations that already have one.

For unsafe browser requests, send the exact frontend `Origin` implicitly through the browser and configure that origin in backend `CLIENT_URL` / `CORS_ORIGINS`. Do not use wildcard credentialed CORS.

## Product catalogue

Use the server for filtering and pagination; do not download the full product collection and filter it in the browser.

```ts
type CatalogQuery = {
  keyword?: string;
  gender?: string[];
  section?: string[];
  style?: string[];
  category?: string[];
  color?: string[];
  size?: string[];
  minPrice?: number;
  maxPrice?: number;
  sort?: "newest" | "oldest" | "price_asc" | "price_desc" |
    "rating" | "popular" | "name_asc" | "name_desc";
  page?: number;
  limit?: number;
  isSale?: boolean;
  inStock?: boolean;
};
```

Example:

```ts
const params = new URLSearchParams();
if (keyword.trim()) params.set("keyword", keyword.trim());
if (filters.gender.length) params.set("gender", filters.gender.join(","));
if (filters.section.length) params.set("section", filters.section.join(","));
if (filters.style.length) params.set("style", filters.style.join(","));
if (filters.category.length) params.set("category", filters.category.join(","));
if (filters.color.length) params.set("color", filters.color.join(","));
if (filters.size.length) params.set("size", filters.size.join(","));
if (filters.minPrice != null) params.set("minPrice", String(filters.minPrice));
if (filters.maxPrice != null) params.set("maxPrice", String(filters.maxPrice));
params.set("sort", sort);
params.set("page", String(page));
params.set("limit", "12");

const response = await fetch(`${API_URL}/api/product?${params}`, {
  credentials: "include",
  headers: { "X-Locale": locale },
  signal: abortController.signal,
});
```

Debounce search by roughly 250–350 ms, cancel stale requests, and reset page to `1` when the query, filters, or sort changes. Use `pagination` from the response rather than paginating only the currently loaded products. Search accepts up to 120 characters and 16 distinct terms; a one-character search is supported but may return many matches.

Product list responses use `ratingsAverage` and `ratingsQuantity`; they do not populate full review documents. Load reviews from `GET /api/review?product=<productId>&page=1&limit=10` when needed.

## Product image editing

The product create/update endpoints accept multipart form data. New files use the `images` field (maximum four files; each file maximum 5 MB). When editing, send retained product image URLs in `existingImages` as a JSON array string, e.g.:

```ts
formData.append("existingImages", JSON.stringify(existingImageUrls));
```

Only URLs that are already attached to that same product can be retained. The server validates them against the existing product record; arbitrary Cloudinary URLs are rejected. The maximum retained list is four images, with up to 2048 characters per URL.

## Orders and checkout

Keep the selected size and color on each cart line and send them with the order. Do not send a client-calculated price as authoritative data; the API reloads the products and calculates the current price/discount and total.

```ts
type CreateOrderRequest = {
  orderItems: Array<{
    productId: string;
    quantity: number;
    size?: string;
    color?: string;
  }>;
  shippingAddress: {
    address: string;
    city: string;
    phone: string;
  };
  paymentMethod?: "cod" | "card";
};
```

Use a unique `Idempotency-Key` value for a checkout submission and reuse that same value only when retrying the same logical order. Cash on delivery is the supported default. Card payment is not integrated in this backend yet.

Stock is shared at the product level, not independently by variant. The order response contains the server-calculated line `price` and `totalPrice`; use those values in order details and receipts.

## Google sign-in

Google OAuth redirects back to `/auth/success` with a short-lived `code` and a `state` value. Read both parameters, remove them from the address bar before loading analytics or third-party scripts, then exchange them immediately:

```ts
const url = new URL(window.location.href);
const code = url.searchParams.get("code");
const state = url.searchParams.get("state");
window.history.replaceState({}, "", "/auth/success");

if (code && state) {
  const response = await fetch(`${API_URL}/api/auth/google/exchange`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Locale": locale,
    },
    body: JSON.stringify({ code, state }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "Google sign-in failed");
  // The backend sets HttpOnly session cookies and returns the safe user object.
}
```

The code is single-use and expires after 60 seconds. The `state` value is bound to an HttpOnly cookie; do not drop it from the exchange request or persist it for later use.

## Socket.IO

Do not pass an access or refresh token in a URL/query string. First request a one-time ticket:

```ts
const response = await fetch(`${API_URL}/api/auth/socket-ticket`, {
  method: "POST",
  credentials: "include",
  headers: { "X-Locale": locale },
});
const result = await response.json();
if (!response.ok) throw new Error(result.message || "Could not create socket ticket");

const socket = io(API_URL, {
  transports: ["websocket", "polling"],
  auth: { ticket: result.data.ticket },
});
```

Tickets expire after 60 seconds and can be used once. Request a new ticket when reconnecting after the old one has been consumed or expired.
