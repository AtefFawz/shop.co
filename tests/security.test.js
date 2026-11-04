import test from "node:test";
import assert from "node:assert/strict";
import requireTrustedOrigin from "../middlewares/requireTrustedOrigin.js";

const runOriginGuard = ({ method = "POST", origin, authorization, cookies = {}, path = "/api/order" } = {}) => {
  const req = {
    method,
    path,
    baseUrl: "",
    cookies,
    get(name) {
      const key = name.toLowerCase();
      if (key === "origin") return origin;
      if (key === "authorization") return authorization;
      return undefined;
    },
  };
  let error = null;
  let continued = false;
  requireTrustedOrigin(req, {}, (nextError) => {
    error = nextError || null;
    continued = !nextError;
  });
  return { error, continued };
};

test("unsafe browser mutations reject missing Origin, including cookie-authenticated requests", () => {
  const missingOrigin = runOriginGuard();
  assert.equal(missingOrigin.continued, false);
  assert.equal(missingOrigin.error?.statusCode, 403);

  const cookieRequest = runOriginGuard({ cookies: { accessToken: "opaque" } });
  assert.equal(cookieRequest.continued, false);
  assert.equal(cookieRequest.error?.statusCode, 403);
});

test("unsafe browser mutations accept only configured exact origins", () => {
  const previousClientUrl = process.env.CLIENT_URL;
  process.env.CLIENT_URL = "https://store.example.test";
  try {
    const allowed = runOriginGuard({ origin: "https://store.example.test" });
    assert.equal(allowed.continued, true);

    const denied = runOriginGuard({ origin: "https://evil.example.test" });
    assert.equal(denied.continued, false);
    assert.equal(denied.error?.statusCode, 403);
  } finally {
    if (previousClientUrl === undefined) delete process.env.CLIENT_URL;
    else process.env.CLIENT_URL = previousClientUrl;
  }
});

test("safe methods and bearer-only server clients do not require browser Origin", () => {
  assert.equal(runOriginGuard({ method: "GET" }).continued, true);
  assert.equal(
    runOriginGuard({ authorization: "Bearer test-token" }).continued,
    true,
  );
});
