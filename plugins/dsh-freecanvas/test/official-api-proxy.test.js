import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createOfficialApiProxy, OFFICIAL_API_PREFIX } from "../lib/official-api-proxy.js";
import apply, { PROXY_PREFIX, resolveOfficialChannelConfig } from "../lib/index.js";

const accessToken = `sk-${"a".repeat(48)}`;
const expiresAt = "2030-01-01T00:00:00.000Z";
const config = { enabled: true, apiUrl: "https://new-api.example", accountPortalUrl: "https://wallet.example" };

function createStore(state = { state: "missing" }) {
    return {
        state,
        saved: undefined,
        disabled: false,
        cleared: false,
        async read() { return this.state; },
        async save(account) {
            this.saved = account;
            this.state = { state: "connected", account };
        },
        async disable() { this.disabled = true; this.state = { state: "missing" }; },
        async clear() { this.cleared = true; this.state = { state: "missing" }; },
    };
}

async function withServer(handler, run) {
    const server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    try {
        return await run(origin);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
}

function request(origin, pathname, { method = "GET", headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(new URL(pathname, origin), {
            method,
            headers: { "sec-fetch-site": "same-origin", ...(method !== "GET" ? { origin } : {}), ...headers },
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
        });
        req.on("error", reject);
        if (body) req.write(body);
        req.end();
    });
}

test("status exposes only the public connection state", async () => {
    const store = createStore();
    const handler = createOfficialApiProxy({ getConfig: () => ({ enabled: false, accountPortalUrl: "https://wallet.example" }), store });
    await withServer(handler, async (origin) => {
        const response = await request(origin, `${OFFICIAL_API_PREFIX}/status`);
        assert.equal(response.status, 200);
        assert.deepEqual(JSON.parse(response.body), { enabled: false, connected: false, account_portal_url: "", token_expires_at: "" });
    });
});

test("a disabled channel hides any previously stored account state", async () => {
    const store = createStore({ state: "connected", account: { version: 1, accessToken, expiresAt } });
    const handler = createOfficialApiProxy({ getConfig: () => ({ enabled: false, accountPortalUrl: "https://wallet.example" }), store });
    await withServer(handler, async (origin) => {
        const response = await request(origin, `${OFFICIAL_API_PREFIX}/status`);
        assert.deepEqual(JSON.parse(response.body), { enabled: false, connected: false, account_portal_url: "", token_expires_at: "" });
    });
});

test("the official API prefix is registered before the canvas fallback", () => {
    const routes = [];
    apply({
        inject() {},
        effect(callback) { callback(); },
        systemPrompt: { section: () => () => undefined },
        webServer: { register: (route) => { routes.push(route); return () => undefined; } },
    }, { autoStartAgent: false });
    assert.ok(routes.findIndex((route) => route.path === OFFICIAL_API_PREFIX) < routes.findIndex((route) => route.path === PROXY_PREFIX));
});

test("official configuration requires a root API URL but permits a wallet-page path", () => {
    assert.equal(resolveOfficialChannelConfig({
        officialChannelEnabled: true,
        officialChannelSingleUserMode: true,
        officialApiUrl: "https://new-api.example/api",
        officialAccountPortalUrl: "https://wallet.example/account/freecanvas",
    }).enabled, false);
    assert.deepEqual(resolveOfficialChannelConfig({
        officialChannelEnabled: true,
        officialChannelSingleUserMode: true,
        officialApiUrl: "https://new-api.example",
        officialAccountPortalUrl: "https://wallet.example/account/freecanvas",
    }), {
        enabled: true,
        apiUrl: "https://new-api.example",
        accountPortalUrl: "https://wallet.example/account/freecanvas",
        development: false,
    });
});

test("an expired local credential exposes its expiry but is never connected", async () => {
    const store = createStore({ state: "expired", account: { version: 1, accessToken, expiresAt } });
    const handler = createOfficialApiProxy({ getConfig: () => config, store });
    await withServer(handler, async (origin) => {
        const response = await request(origin, `${OFFICIAL_API_PREFIX}/status`);
        assert.deepEqual(JSON.parse(response.body), { enabled: true, connected: false, account_portal_url: "https://wallet.example", token_expires_at: expiresAt });
    });
});

test("pair exchange stores the device token but never returns it to the browser", async () => {
    const store = createStore();
    let upstreamHeaders;
    const handler = createOfficialApiProxy({
        getConfig: () => config,
        store,
        fetchImpl: async (url, init) => {
            assert.equal(url, "https://new-api.example/api/freecanvas/pair/exchange");
            upstreamHeaders = new Headers(init.headers);
            return new Response(JSON.stringify({ access_token: accessToken, expires_at: expiresAt }), { headers: { "content-type": "application/json" } });
        },
    });
    await withServer(handler, async (origin) => {
        const response = await request(origin, `${OFFICIAL_API_PREFIX}/pair/exchange`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: "Bearer forged", cookie: "session=forged" },
            body: JSON.stringify({ pair_code: "a".repeat(32) }),
        });
        assert.equal(response.status, 200);
        assert.equal(response.body.includes(accessToken), false);
        assert.equal(upstreamHeaders.get("authorization"), null);
        assert.equal(store.saved.accessToken, accessToken);
    });
});

test("a failed local save revokes the just-created remote device token", async () => {
    const store = createStore();
    store.save = async () => { throw new Error("disk unavailable"); };
    const calls = [];
    const handler = createOfficialApiProxy({
        getConfig: () => config,
        store,
        fetchImpl: async (url, init) => {
            calls.push({ url, headers: new Headers(init.headers) });
            if (url.endsWith("/pair/exchange")) return new Response(JSON.stringify({ access_token: accessToken, expires_at: expiresAt }), { headers: { "content-type": "application/json" } });
            return new Response(null, { status: 204 });
        },
    });
    await withServer(handler, async (origin) => {
        const response = await request(origin, `${OFFICIAL_API_PREFIX}/pair/exchange`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pair_code: "a".repeat(32) }),
        });
        assert.equal(response.status, 500);
        assert.equal(response.body.includes(accessToken), false);
        assert.equal(calls.length, 2);
        assert.equal(calls[1].url, "https://new-api.example/api/freecanvas/device");
        assert.equal(calls[1].headers.get("authorization"), `Bearer ${accessToken}`);
    });
});

test("account forwarding injects only the stored token and filters sensitive fields", async () => {
    const store = createStore({ state: "connected", account: { version: 1, accessToken, expiresAt } });
    let upstreamHeaders;
    const handler = createOfficialApiProxy({
        getConfig: () => config,
        store,
        fetchImpl: async (_url, init) => {
            upstreamHeaders = new Headers(init.headers);
            return new Response(JSON.stringify({ connected: true, points: "123", token_expires_at: expiresAt, access_token: "leak-me", email: "hidden@example.com" }), { headers: { "content-type": "application/json" } });
        },
    });
    await withServer(handler, async (origin) => {
        const response = await request(origin, `${OFFICIAL_API_PREFIX}/account`, { headers: { authorization: "Bearer forged", cookie: "session=forged" } });
        assert.equal(response.status, 200);
        assert.equal(upstreamHeaders.get("authorization"), `Bearer ${accessToken}`);
        assert.equal(upstreamHeaders.get("cookie"), null);
        assert.deepEqual(JSON.parse(response.body), { connected: true, points: "123", token_expires_at: expiresAt });
    });
});

test("cross-site mutation, unknown routes, queries, and non-official models are rejected locally", async () => {
    const store = createStore({ state: "connected", account: { version: 1, accessToken, expiresAt } });
    let calls = 0;
    const handler = createOfficialApiProxy({ getConfig: () => config, store, fetchImpl: async () => { calls += 1; return new Response(); } });
    await withServer(handler, async (origin) => {
        const crossSite = await request(origin, `${OFFICIAL_API_PREFIX}/redeem`, {
            method: "POST",
            headers: { "content-type": "application/json", origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
            body: JSON.stringify({ code: "a".repeat(32) }),
        });
        const unknown = await request(origin, `${OFFICIAL_API_PREFIX}/https://attacker.example`);
        const queried = await request(origin, `${OFFICIAL_API_PREFIX}/account?access_token=bad`);
        const wrongModel = await request(origin, `${OFFICIAL_API_PREFIX}/images/generations`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ model: "text-model" }),
        });
        assert.equal(crossSite.status, 403);
        assert.equal(unknown.status, 404);
        assert.equal(queried.status, 404);
        assert.equal(wrongModel.status, 403);
        assert.equal(calls, 0);
    });
});

test("failed remote device revocation disables the local credential", async () => {
    const store = createStore({ state: "connected", account: { version: 1, accessToken, expiresAt } });
    const handler = createOfficialApiProxy({ getConfig: () => config, store, fetchImpl: async () => new Response("failure", { status: 503 }) });
    await withServer(handler, async (origin) => {
        const response = await request(origin, `${OFFICIAL_API_PREFIX}/device`, { method: "DELETE" });
        assert.equal(response.status, 502);
        assert.equal(store.disabled, true);
        assert.equal(store.cleared, false);
    });
});

test("an allowed image request streams the upstream response without browser credentials", async () => {
    const store = createStore({ state: "connected", account: { version: 1, accessToken, expiresAt } });
    let upstreamHeaders;
    const handler = createOfficialApiProxy({
        getConfig: () => config,
        store,
        fetchImpl: async (url, init) => {
            assert.equal(url, "https://new-api.example/v1/images/generations");
            upstreamHeaders = new Headers(init.headers);
            return new Response("generated-media", { headers: { "content-type": "image/png", "content-disposition": "inline" } });
        },
    });
    await withServer(handler, async (origin) => {
        const response = await request(origin, `${OFFICIAL_API_PREFIX}/images/generations`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: "Bearer forged", cookie: "session=forged" },
            body: JSON.stringify({ model: "gpt-image-2", prompt: "test" }),
        });
        assert.equal(response.status, 200);
        assert.equal(response.body, "generated-media");
        assert.equal(upstreamHeaders.get("authorization"), `Bearer ${accessToken}`);
        assert.equal(upstreamHeaders.get("cookie"), null);
    });
});
