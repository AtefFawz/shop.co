# Frontend integration contract

The backend is ready for the catalog and order UI changes below. Keep the API calls server-driven; do not download the full product catalog and filter it in the browser.

## Google sign-in callback (updated security flow)

Google now redirects to the frontend with a short-lived, single-use `code`, not an access token:

```text
/auth/success?code=ONE_TIME_CODE
```

The success page should immediately read the code and remove it from the address bar before loading analytics or other third-party scripts. Then exchange it once:

```ts
const url = new URL(window.location.href);
const code = url.searchParams.get("code");
window.history.replaceState({}, "", "/auth/success");

if (code) {
  const response = await fetch(`${API_URL}/api/auth/google/exchange`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Locale": locale },
    body: JSON.stringify({ code }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "Google sign-in failed");
  // Keep result.data.token as the short-lived access token using the app's existing auth state.
  // The refresh token is an HTTP-only cookie and must never be read by client JavaScript.
}
```

Authorization codes expire after 60 seconds and can be exchanged only once. The backend also validates a one-time OAuth `state` value bound to an HTTP-only, short-lived cookie.

## Catalog query

```ts
export type CatalogQuery = {
  keyword?: string;
  gender?: string[];
  section?: string[];
  style?: string[];
  category?: string[];
  minPrice?: number;
  maxPrice?: number;
  color?: string[];
  size?: string[];
  sort?:
    | "newest"
    | "oldest"
    | "price_asc"
    | "price_desc"
    | "rating"
    | "popular"
    | "name_asc"
    | "name_desc";
  page?: number;
  limit?: number;
  isSale?: boolean;
  inStock?: boolean;
};

export type CatalogResponse<TProduct> = {
  status: string;
  results: number;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  data: { Products: TProduct[] };
};
```

Build the URL parameters from the current UI state:

```ts
const params = new URLSearchParams();
if (keyword.trim()) params.set("keyword", keyword.trim());
if (filters.gender.length) params.set("gender", filters.gender.join(","));
if (filters.section.length) params.set("section", filters.section.join(","));
if (filters.style.length) params.set("style", filters.style.join(","));
if (filters.maxPrice != null) params.set("maxPrice", String(filters.maxPrice));
if (filters.color.length) params.set("color", filters.color.join(","));
if (filters.size.length) params.set("size", filters.size.join(","));
params.set("sort", sort);
params.set("page", String(page));
params.set("limit", "12");

const response = await fetch(`${API_URL}/api/product?${params.toString()}`, {
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "X-Locale": locale, // "ar" or "en"
  },
  signal: abortController.signal,
});
```

Debounce the search term by 250–350 ms, cancel the previous request with `AbortController`, and reset page to `1` whenever the keyword, filters, or sort changes. Render pagination from the API's `pagination` object. A one-character keyword is supported, but naturally can produce many matches. Keep search terms within the API limit of 120 characters and 16 distinct terms.

## Order creation

```ts
export type CreateOrderItem = {
  productId: string;
  quantity: number;
  size?: string;
  color?: string;
};

export type CreateOrderRequest = {
  orderItems: CreateOrderItem[];
  shippingAddress: {
    address: string;
    city: string;
    phone: string;
  };
  paymentMethod?: "cod" | "card";
};
```

Preserve the selected size and color on each cart line and send them when the customer submits the order. Values must match the corresponding product's configured `size` and `colors` options. They are optional for compatibility with older clients. Do not send a client-calculated `price` as an authoritative value; the API recalculates line prices and order total from MongoDB.

Stock is currently shared at the product level. If inventory must eventually differ by size/color, the next data-model step is a `variants[]` collection with a stable variant identifier, SKU, per-variant stock, and optional price override. That requires a deliberate cart and inventory migration, so it is not silently introduced in this backend revision.

## Customer engagement features (V6 feature layer)

All routes below use the existing HttpOnly-cookie session (or supported bearer token). Product IDs are Mongo ObjectIds.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/features/me?type=saved\|recent\|price-alert` | Read the signed-in customer's saved-for-later list, recent views, or price alerts |
| POST / DELETE | `/api/features/saved/:productId` | Save or remove a product for later (idempotent upsert) |
| POST | `/api/features/recent/:productId` | Record a signed-in customer's recent product view; server retains the newest 30 |
| POST / DELETE | `/api/features/price-alerts/:productId` | Set `{ "targetPrice": 1200 }` or remove the alert |
| GET | `/api/features/recommendations` | Public recommendations; signed-in customers receive category-aware results based on recent/saved items and non-cancelled orders |
| GET | `/api/features/admin/insights` | Admin/manager engagement counts and top saved products |
| GET | `/api/order/:id/invoice` | Owner/admin-authorized invoice data for print-to-PDF |

Price alerts are evaluated when an administrator updates a product price and when a customer creates an alert. A notification is persisted and emitted through the existing user Socket.IO room. This is an in-app alert; no email/SMS provider is configured by this feature.

Orders now append a `statusHistory` event on each accepted status transition. Existing orders without historical events remain readable and are not backfilled with fabricated timestamps. The invoice endpoint returns a server-calculated snapshot using stored order line prices and totals; the frontend print view can be saved as PDF by the browser.

Comparison is intentionally a local, persisted client-side utility (maximum four products) because it does not require account data or server writes. The size guide only displays the sizes configured on the product. It does not invent centimeter measurements when the catalog has no measurement data.


Production deployment note: Mongoose `autoIndex` is disabled in production. After deploying the new backend, run `npm run db:features-indexes` once to create the `ProductEngagement` unique and lookup indexes. The command is safe to re-run.
