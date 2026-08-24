// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 JustinQiuck

import { Readable } from "node:stream";

import { createOfficialAccountStore } from "./official-account-store.js";

export const OFFICIAL_API_PREFIX = "/dsh-freecanvas/official-api";
export const OFFICIAL_IMAGE_MODEL = "gpt-image-2";
export const OFFICIAL_VIDEO_MODEL = "grok-imagine-video";

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const MAX_JSON_RESPONSE_BYTES = 128 * 1024;
const MAX_ACTIVE_MEDIA_REQUESTS = 2;
const UPSTREAM_TIMEOUT_MS = 60_000;
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const SAFE_RESPONSE_HEADERS = new Set(["content-type", "content-disposition", "accept-ranges"]);

class RequestError extends Error {
    constructor(status, code) {
        super(code);
        this.status = status;
        this.code = code;
    }
}

function sendJson(res, status, value) {
    const body = Buffer.from(JSON.stringify(value), "utf8");
    res.writeHead(status, {
        "cache-control": "no-store, max-age=0",
        "content-type": "application/json; charset=utf-8",
        "content-length": String(body.length),
        "x-content-type-options": "nosniff",
    });
    res.end(body);
}

function requestUrl(req) {
    try {
        return new URL(req.url || "/", "http://dsh.local");
    } catch {
        throw new RequestError(400, "INVALID_REQUEST");
    }
}

function isLoopback(req) {
    const address = String(req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
    return LOOPBACK_ADDRESSES.has(address);
}

function expectedOrigin(req) {
    const host = String(req.headers.host || "").trim();
    if (!host) return "";
    try {
        return new URL(`${req.socket?.encrypted ? "https" : "http"}://${host}`).origin;
    } catch {
        return "";
    }
}

function hasTrustedBrowserContext(req, requireOrigin) {
    if (!isLoopback(req)) return false;
    if (req.headers.forwarded || req.headers["x-forwarded-for"] || req.headers["x-real-ip"]) return false;
    const fetchSite = String(req.headers["sec-fetch-site"] || "");
    if (fetchSite !== "same-origin" && fetchSite !== "none") return false;
    if (!requireOrigin) return true;
    const origin = String(req.headers.origin || "");
    return Boolean(origin) && origin === expectedOrigin(req);
}

function hasSafeUpstream(config) {
    try {
        const upstream = new URL(config.apiUrl);
        if (upstream.username || upstream.password || upstream.search || upstream.hash || upstream.pathname !== "/") return false;
        if (upstream.protocol === "https:") return true;
        return config.development === true && upstream.protocol === "http:" && LOOPBACK_HOSTS.has(upstream.hostname);
    } catch {
        return false;
    }
}

function contentType(req) {
    return String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
}

function requireJson(req) {
    if (contentType(req) !== "application/json") throw new RequestError(415, "UNSUPPORTED_CONTENT_TYPE");
}

async function readBody(req, maxBytes) {
    const length = Number(req.headers["content-length"]);
    if (Number.isFinite(length) && length > maxBytes) {
        req.resume?.();
        throw new RequestError(413, "REQUEST_TOO_LARGE");
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maxBytes) throw new RequestError(413, "REQUEST_TOO_LARGE");
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}

async function readJsonBody(req, maxBytes = MAX_JSON_BYTES) {
    requireJson(req);
    const body = await readBody(req, maxBytes);
    try {
        return JSON.parse(body.toString("utf8"));
    } catch {
        throw new RequestError(400, "INVALID_JSON");
    }
}

function routeFor(url) {
    if (url.search || url.pathname.includes("%")) return null;
    const suffix = url.pathname.slice(OFFICIAL_API_PREFIX.length) || "/";
    if (suffix === "/status") return { name: "status", method: "GET" };
    if (suffix === "/pair/exchange") return { name: "pair", method: "POST" };
    if (suffix === "/account") return { name: "account", method: "GET" };
    if (suffix === "/redeem") return { name: "redeem", method: "POST" };
    if (suffix === "/device") return { name: "device", method: "DELETE" };
    if (suffix === "/images/generations") return { name: "image-generation", method: "POST", upstream: "/v1/images/generations", model: OFFICIAL_IMAGE_MODEL, bodyType: "json" };
    if (suffix === "/images/edits") return { name: "image-edit", method: "POST", upstream: "/v1/images/edits", model: OFFICIAL_IMAGE_MODEL, bodyType: "multipart" };
    if (suffix === "/videos") return { name: "video-create", method: "POST", upstream: "/v1/videos", model: OFFICIAL_VIDEO_MODEL, bodyType: "multipart" };
    const task = suffix.match(/^\/videos\/([A-Za-z0-9_-]{1,128})(\/content)?$/);
    if (!task) return null;
    return {
        name: task[2] ? "video-content" : "video-status",
        method: "GET",
        upstream: `/v1/videos/${task[1]}${task[2] || ""}`,
    };
}

function readMultipartModel(body, header) {
    const matched = header.match(/(?:^|;)\s*boundary=(?:"([^"]{1,100})"|([^;\s]{1,100}))/i);
    const boundary = matched?.[1] || matched?.[2];
    if (!boundary) return "";
    const marker = Buffer.from(`--${boundary}`);
    const separator = Buffer.from("\r\n\r\n");
    const tail = Buffer.from("\r\n");
    let cursor = 0;
    const values = [];
    while (cursor < body.length) {
        const start = body.indexOf(marker, cursor);
        if (start < 0) break;
        const headerStart = start + marker.length;
        if (body.subarray(headerStart, headerStart + 2).equals(Buffer.from("--"))) break;
        const headerEnd = body.indexOf(separator, headerStart);
        if (headerEnd < 0) return "";
        const partHeaders = body.subarray(headerStart, headerEnd).toString("utf8");
        const valueStart = headerEnd + separator.length;
        const nextBoundary = body.indexOf(marker, valueStart);
        if (nextBoundary < 0) return "";
        const valueEnd = nextBoundary >= tail.length && body.subarray(nextBoundary - tail.length, nextBoundary).equals(tail) ? nextBoundary - tail.length : nextBoundary;
        if (/content-disposition:\s*form-data;[^\r\n]*\bname="model"(?:;|\r|$)/i.test(partHeaders) && !/\bfilename=/i.test(partHeaders)) {
            values.push(body.subarray(valueStart, valueEnd).toString("utf8"));
        }
        cursor = nextBoundary + marker.length;
    }
    return values.length === 1 ? values[0].trim() : "";
}

function assertMediaModel(route, body, rawContentType) {
    let model = "";
    if (route.bodyType === "json") {
        if (!/^application\/json\b/i.test(rawContentType)) throw new RequestError(415, "UNSUPPORTED_CONTENT_TYPE");
        try {
            const payload = JSON.parse(body.toString("utf8"));
            model = typeof payload?.model === "string" ? payload.model.trim() : "";
        } catch {
            throw new RequestError(400, "INVALID_JSON");
        }
    } else if (/^multipart\/form-data\b/i.test(rawContentType)) {
        model = readMultipartModel(body, rawContentType);
    } else {
        throw new RequestError(415, "UNSUPPORTED_CONTENT_TYPE");
    }
    if (model !== route.model) throw new RequestError(403, "MODEL_NOT_ALLOWED");
}

function publicAccount(account) {
    if (!account || typeof account !== "object") return { connected: true };
    const value = { connected: true };
    for (const key of ["points", "used_points", "points_scale", "topup_link", "token_expires_at"]) {
        if (typeof account[key] === "string" || typeof account[key] === "number") value[key] = account[key];
    }
    return value;
}

async function readSmallResponse(response) {
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_JSON_RESPONSE_BYTES) throw new RequestError(502, "UPSTREAM_RESPONSE_TOO_LARGE");
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_JSON_RESPONSE_BYTES) throw new RequestError(502, "UPSTREAM_RESPONSE_TOO_LARGE");
            chunks.push(Buffer.from(value));
        }
    } finally {
        await reader.cancel().catch(() => undefined);
    }
    return Buffer.concat(chunks);
}

async function responseJson(response) {
    const body = await readSmallResponse(response);
    try {
        return JSON.parse(body.toString("utf8"));
    } catch {
        throw new RequestError(502, "INVALID_UPSTREAM_RESPONSE");
    }
}

function safeHeaders(response) {
    const headers = {
        "cache-control": "no-store, max-age=0",
        "x-content-type-options": "nosniff",
    };
    for (const [key, value] of response.headers) {
        if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase())) headers[key] = value;
    }
    return headers;
}

function proxyError(res, status) {
    const mapped = status === 401 || status === 403 || status === 429 ? status : 502;
    sendJson(res, mapped, { error: "OFFICIAL_UPSTREAM_ERROR" });
}

function disabledStatus(config, account) {
    const enabled = config.enabled === true;
    const expiresAt = enabled && (account?.state === "connected" || account?.state === "expired") ? account.account.expiresAt : "";
    return {
        enabled,
        connected: enabled && account?.state === "connected",
        account_portal_url: enabled ? config.accountPortalUrl : "",
        token_expires_at: expiresAt,
    };
}

export function createOfficialApiProxy({ getConfig, store = createOfficialAccountStore(), fetchImpl = fetch } = {}) {
    if (typeof getConfig !== "function") throw new TypeError("getConfig is required");
    let activeMediaRequests = 0;

    const upstream = async (config, path, token, init = {}) => {
        const url = new URL(path, `${config.apiUrl}/`).toString();
        try {
            return await fetchImpl(url, {
                ...init,
                headers: {
                    accept: "application/json, */*;q=0.1",
                    ...(init.headers || {}),
                    ...(token ? { authorization: `Bearer ${token}` } : {}),
                },
                // Keep the timeout active while the response body is read or
                // streamed; clearing it after headers would leave media reads unbounded.
                signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
            });
        } catch {
            throw new RequestError(502, "OFFICIAL_UPSTREAM_UNAVAILABLE");
        }
    };

    const revoke = async (config, token) => {
        try {
            const response = await upstream(config, "/api/freecanvas/device", token, { method: "DELETE" });
            if (response.ok) return true;
            await response.body?.cancel().catch(() => undefined);
        } catch {
            // The caller keeps the local credential unusable even when this best-effort rollback fails.
        }
        return false;
    };

    return async function officialApiProxy(req, res) {
        try {
            const url = requestUrl(req);
            if (!url.pathname.startsWith(`${OFFICIAL_API_PREFIX}/`) && url.pathname !== OFFICIAL_API_PREFIX) throw new RequestError(404, "NOT_FOUND");
            const route = routeFor(url);
            if (!route) throw new RequestError(404, "NOT_FOUND");
            if (req.method !== route.method) {
                res.setHeader?.("allow", route.method);
                throw new RequestError(405, "METHOD_NOT_ALLOWED");
            }
            const stateChanging = route.method !== "GET";
            if (!hasTrustedBrowserContext(req, stateChanging)) throw new RequestError(403, "UNTRUSTED_BROWSER_CONTEXT");
            const config = getConfig() || { enabled: false };
            const account = await store.read();
            if (route.name === "status") return sendJson(res, 200, disabledStatus(config, account));
            if (config.enabled !== true) throw new RequestError(503, "OFFICIAL_CHANNEL_UNAVAILABLE");
            if (!hasSafeUpstream(config)) throw new RequestError(503, "OFFICIAL_CHANNEL_UNAVAILABLE");

            if (route.name === "pair") {
                const payload = await readJsonBody(req, 1024);
                const pairCode = typeof payload?.pair_code === "string" ? payload.pair_code.trim() : "";
                if (!/^[A-Za-z0-9_-]{32,256}$/.test(pairCode)) throw new RequestError(400, "INVALID_PAIR_CODE");
                const response = await upstream(config, "/api/freecanvas/pair/exchange", "", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ pair_code: pairCode }),
                });
                if (!response.ok) return proxyError(res, response.status);
                const value = await responseJson(response);
                const accessToken = typeof value?.access_token === "string" ? value.access_token : "";
                const expiresAt = typeof value?.expires_at === "string" ? value.expires_at : "";
                try {
                    await store.save({ version: 1, accessToken, expiresAt });
                } catch {
                    await revoke(config, accessToken);
                    throw new RequestError(500, "OFFICIAL_ACCOUNT_SAVE_FAILED");
                }
                return sendJson(res, 200, publicAccount({ ...value?.account, token_expires_at: expiresAt }));
            }

            if (account.state !== "connected") throw new RequestError(401, "OFFICIAL_ACCOUNT_NOT_CONNECTED");

            if (route.name === "account") {
                const response = await upstream(config, "/api/freecanvas/account", account.account.accessToken, { method: "GET" });
                if (!response.ok) {
                    if (response.status === 401 || response.status === 403) await store.disable();
                    return proxyError(res, response.status);
                }
                return sendJson(res, 200, publicAccount(await responseJson(response)));
            }

            if (route.name === "redeem") {
                const payload = await readJsonBody(req, 1024);
                const code = typeof payload?.code === "string" ? payload.code.trim() : "";
                if (!/^[A-Za-z0-9]{32}$/.test(code)) throw new RequestError(400, "INVALID_CARD_CODE");
                const response = await upstream(config, "/api/freecanvas/redeem", account.account.accessToken, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ card_code: code }),
                });
                if (!response.ok) {
                    if (response.status === 401 || response.status === 403) await store.disable();
                    return proxyError(res, response.status);
                }
                const value = await responseJson(response);
                return sendJson(res, 200, {
                    success: value?.success === true,
                    ...(typeof value?.added_points === "string" ? { added_points: value.added_points } : {}),
                    ...(typeof value?.points === "string" ? { points: value.points } : {}),
                });
            }

            if (route.name === "device") {
                const response = await upstream(config, "/api/freecanvas/device", account.account.accessToken, { method: "DELETE" });
                if (!response.ok) {
                    await store.disable();
                    return proxyError(res, response.status);
                }
                await response.body?.cancel().catch(() => undefined);
                await store.clear();
                res.writeHead(204, { "cache-control": "no-store, max-age=0" });
                res.end();
                return;
            }

            const rawContentType = String(req.headers["content-type"] || "");
            const body = route.method === "POST" ? await readBody(req, route.bodyType === "json" ? MAX_JSON_BYTES : MAX_MEDIA_BYTES) : undefined;
            if (route.method === "POST") assertMediaModel(route, body, rawContentType);
            if (activeMediaRequests >= MAX_ACTIVE_MEDIA_REQUESTS) throw new RequestError(429, "TOO_MANY_MEDIA_REQUESTS");
            activeMediaRequests += 1;
            try {
                const response = await upstream(config, route.upstream, account.account.accessToken, {
                    method: route.method,
                    headers: route.method === "POST" ? { "content-type": rawContentType } : {},
                    ...(body?.length ? { body } : {}),
                });
                if (!response.ok) {
                    if (response.status === 401 || response.status === 403) await store.disable();
                    return proxyError(res, response.status);
                }
                res.writeHead(response.status, safeHeaders(response));
                if (!response.body) {
                    res.end();
                    return;
                }
                try {
                    await new Promise((resolve, reject) => Readable.fromWeb(response.body).on("error", reject).pipe(res).on("finish", resolve).on("error", reject));
                } catch {
                    // Headers may already be on the wire, so never append a
                    // JSON error body to a partially streamed media response.
                    res.destroy();
                }
            } finally {
                activeMediaRequests -= 1;
            }
        } catch (error) {
            const failure = error instanceof RequestError ? error : new RequestError(500, "OFFICIAL_PROXY_FAILED");
            sendJson(res, failure.status, { error: failure.code });
        }
    };
}
