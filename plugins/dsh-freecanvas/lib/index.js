// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 JustinQiuck

import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
import { createOfficialApiProxy, OFFICIAL_API_PREFIX } from "./official-api-proxy.js";
import { createPersistentStorageHandler, PERSISTENT_STORAGE_PATH } from "./persistent-storage.js";

/**
 * dsh-plugin-freecanvas host half.
 *
 * Serves the bundled canvas on the DSH origin and registers the settings and
 * model guidance used by the browser half. An explicit `canvasUrl` switches
 * the same route into external-service proxy mode for development or custom
 * deployments without changing the iframe origin.
 */

export const CANVAS_WEB_SETTINGS_NAMESPACE = settingsNamespace("dsh-freecanvas");

const CANVAS_PATH = "/dsh-freecanvas";
const PROXY_PREFIX = CANVAS_PATH;
const AGENT_BOOTSTRAP_PATH = "/canvas-agent-bootstrap";
const LAYOUT_STATE_PATH = "/dsh-freecanvas-layout";
const AGENT_CONFIG_FILE = path.join(os.homedir(), ".infinite-canvas", "canvas-agent.json");
const LAYOUT_STATE_FILE = path.join(process.env.DSH_HOME || path.join(os.homedir(), ".dsh"), "storages", "dsh-freecanvas-layout.json");
const PERSISTENT_STORAGE_ROOT = path.join(process.env.DSH_HOME || path.join(os.homedir(), ".dsh"), "storages", "dsh-freecanvas");
const BUNDLED_CANVAS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web");
const require = createRequire(import.meta.url);
const AGENT_ENTRY = require.resolve("@basketikun/canvas-agent");
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export const Config = z.object({
    canvasUrl: z.string().default(""),
    autoStartAgent: z.boolean().default(true),
    officialApiUrl: z.string().default(""),
    officialAccountPortalUrl: z.string().default(""),
    officialChannelEnabled: z.boolean().default(false),
    officialChannelSingleUserMode: z.boolean().default(false),
    officialChannelDevelopmentMode: z.boolean().default(false),
});

function normalizeOfficialUrl(value, allowHttpLoopback, allowPath = false) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
        const parsed = new URL(raw);
        if (parsed.username || parsed.password || parsed.search || parsed.hash || (!allowPath && parsed.pathname !== "/")) return "";
        if (parsed.protocol === "https:") return parsed.toString().replace(/\/$/, "");
        if (allowHttpLoopback && parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname)) return parsed.toString().replace(/\/$/, "");
    } catch {
        return "";
    }
    return "";
}

/** Server-only official-channel configuration. Never expose this object to the browser. */
export function resolveOfficialChannelConfig(config) {
    if (config?.officialChannelEnabled !== true) return { enabled: false, reason: "disabled" };
    if (config?.officialChannelSingleUserMode !== true) return { enabled: false, reason: "single-user-required" };
    const allowHttpLoopback = config?.officialChannelDevelopmentMode === true;
    const apiUrl = normalizeOfficialUrl(config?.officialApiUrl, allowHttpLoopback);
    const accountPortalUrl = normalizeOfficialUrl(config?.officialAccountPortalUrl, allowHttpLoopback, true);
    if (!apiUrl || !accountPortalUrl) return { enabled: false, reason: "invalid-url" };
    return { enabled: true, apiUrl, accountPortalUrl, development: allowHttpLoopback };
}

/** Services injected into this plugin by the harness (webServer: proxy route). */
const inject = ["systemPrompt", "webServer"];

/** Model-facing announcement: plugin presence and capabilities. */
const CANVAS_WEB_GUIDANCE = "本机已安装 dsh-plugin-freecanvas：侧边栏「DSH FreeCanvas」入口可直接打开随插件安装的画布；配合 Canvas Agent 与 dsh-mcp-client，可让 agent 读取画布、创建节点、连接流程并触发生成。";

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 210;

/**
 * External Vite services still emit root-relative development assets. Prefix
 * those paths so proxy mode stays on the same DSH origin as the bundled mode.
 */
// Only rewrite quote-delimited paths. Matching `(` would also match JavaScript
// regex literals such as `replace(/@vite\/client$/, "")` and corrupt the script.
const REWRITE_RE = /(["'`])(\/(?:src|@vite|@react-refresh|node_modules|plugins|config\.js|logo\.svg|favicon\.svg|manifest\.webmanifest)[^"'`) ]*)/g;

function rewriteCanvasPaths(text) {
    return text.replace(REWRITE_RE, (whole, quote, path) => quote + PROXY_PREFIX + path);
}

const CONTENT_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".ogg": "audio/ogg",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".wasm": "application/wasm",
    ".webm": "video/webm",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
};

function sendText(res, status, message, headers = {}) {
    const body = Buffer.from(message, "utf8");
    res.writeHead(status, {
        "content-type": "text/plain; charset=utf-8",
        "content-length": String(body.length),
        ...headers,
    });
    res.end(body);
}

function sendJson(res, status, value) {
    const body = Buffer.from(JSON.stringify(value), "utf8");
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        "content-length": String(body.length),
    });
    res.end(body);
}

function readLayoutState(filePath) {
    try {
        const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (value?.version !== 1 || typeof value.active !== "boolean" || !["split", "canvas"].includes(value.mode)) throw new Error("invalid layout state");
        return { active: value.active, mode: value.mode };
    } catch {
        return { active: false, mode: "split" };
    }
}

function writeLayoutState(filePath, state) {
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify({ version: 1, ...state })}\n`, { mode: 0o600 });
    fs.renameSync(temporary, filePath);
    fs.chmodSync(filePath, 0o600);
}

export function createLayoutStateHandler(filePath = LAYOUT_STATE_FILE) {
    return async (req, res) => {
        let requestUrl;
        try {
            requestUrl = new URL(req.url ?? "/", "http://x");
        } catch {
            sendText(res, 400, "Bad Request");
            return;
        }
        if (requestUrl.pathname !== LAYOUT_STATE_PATH || requestUrl.search) {
            sendText(res, 404, "Not Found");
            return;
        }
        const fetchSite = String(req.headers["sec-fetch-site"] || "");
        if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
            sendText(res, 403, "Forbidden");
            return;
        }
        if (req.method === "GET") {
            sendJson(res, 200, readLayoutState(filePath));
            return;
        }
        if (req.method !== "PUT") {
            sendText(res, 405, "Method Not Allowed", { allow: "GET, PUT" });
            return;
        }
        if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
            sendText(res, 415, "Unsupported Media Type");
            return;
        }
        const chunks = [];
        let size = 0;
        try {
            for await (const chunk of req) {
                size += chunk.length;
                if (size > 1024) throw new Error("too large");
                chunks.push(chunk);
            }
            const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (typeof value?.active !== "boolean" || !["split", "canvas"].includes(value.mode)) throw new Error("invalid layout state");
            writeLayoutState(filePath, { active: value.active, mode: value.mode });
            res.writeHead(204, { "cache-control": "no-store, max-age=0" });
            res.end();
        } catch {
            sendText(res, size > 1024 ? 413 : 400, size > 1024 ? "Payload Too Large" : "Bad Request");
        }
    };
}

function serveBundledCanvas(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
        sendText(res, 405, "Method Not Allowed", { allow: "GET, HEAD" });
        return;
    }
    const indexPath = path.join(BUNDLED_CANVAS_DIR, "index.html");
    if (!fs.existsSync(indexPath)) {
        sendText(res, 503, "DSH FreeCanvas 内置资源缺失：请重新安装完整插件包，或在插件目录运行 npm run build:web 后重试");
        return;
    }
    let requestUrl;
    try {
        requestUrl = new URL(req.url ?? "/", "http://x");
    } catch {
        sendText(res, 400, "Bad Request");
        return;
    }
    if (requestUrl.pathname !== CANVAS_PATH && !requestUrl.pathname.startsWith(`${CANVAS_PATH}/`)) {
        sendText(res, 404, "Not Found");
        return;
    }
    let relativePath;
    try {
        relativePath = decodeURIComponent(requestUrl.pathname.slice(CANVAS_PATH.length)).replace(/^\/+/, "");
    } catch {
        sendText(res, 400, "Bad Request");
        return;
    }
    const resolveFile = (relative) => {
        const candidate = path.resolve(BUNDLED_CANVAS_DIR, relative);
        if (candidate !== BUNDLED_CANVAS_DIR && !candidate.startsWith(`${BUNDLED_CANVAS_DIR}${path.sep}`)) return null;
        return candidate;
    };
    let filePath = resolveFile(relativePath || "index.html");
    if (!filePath) {
        sendText(res, 403, "Forbidden");
        return;
    }
    let stat;
    try {
        stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            filePath = path.join(filePath, "index.html");
            stat = fs.statSync(filePath);
        }
    } catch {
        if (path.extname(relativePath)) {
            sendText(res, 404, "Not Found");
            return;
        }
        filePath = indexPath;
        stat = fs.statSync(filePath);
    }
    if (!stat.isFile()) {
        sendText(res, 404, "Not Found");
        return;
    }
    const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const immutable = relativePath.startsWith("assets/");
    res.writeHead(200, {
        "content-type": contentType,
        "content-length": String(stat.size),
        "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    });
    if (req.method === "HEAD") {
        res.end();
        return;
    }
    fs.createReadStream(filePath).on("error", () => res.destroy()).pipe(res);
}

function readAgentConfig() {
    try {
        const value = JSON.parse(fs.readFileSync(AGENT_CONFIG_FILE, "utf8"));
        const url = String(value?.url || "").trim().replace(/\/$/, "");
        const token = String(value?.token || "").trim();
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) || !token) return null;
        return { url, token };
    } catch {
        return null;
    }
}

async function agentHealthy(config) {
    if (!config) return false;
    try {
        const response = await fetch(`${config.url}/health`, { signal: AbortSignal.timeout(800) });
        return response.ok;
    } catch {
        return false;
    }
}

function createAgentManager(autoStart) {
    let child;
    let startPromise;
    let stopped = false;

    const ensure = async () => {
        const current = readAgentConfig();
        if (await agentHealthy(current)) return current;
        if (!autoStart()) throw new Error("Canvas Agent 未运行，且自动启动已关闭");
        if (!child || child.exitCode !== null) {
            const env = { ...process.env };
            if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = "1";
            child = spawn(process.execPath, [AGENT_ENTRY], {
                cwd: os.homedir(),
                env,
                stdio: "ignore",
            });
            child.once("error", () => { child = undefined; });
            child.once("exit", () => { child = undefined; });
        }
        const deadline = Date.now() + 12_000;
        while (!stopped && Date.now() < deadline) {
            const config = readAgentConfig();
            if (await agentHealthy(config)) return config;
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        throw new Error("Canvas Agent 在 12 秒内未就绪");
    };

    return {
        ensure() {
            if (!startPromise) startPromise = ensure().finally(() => {
                startPromise = undefined;
            });
            return startPromise;
        },
        dispose() {
            stopped = true;
            if (child && child.exitCode === null) child.kill("SIGTERM");
            child = undefined;
        },
    };
}

async function serveAgentBootstrap(req, res, manager) {
    let requestUrl;
    try {
        requestUrl = new URL(req.url ?? "/", "http://x");
    } catch {
        res.writeHead(400);
        res.end();
        return;
    }
    if (requestUrl.pathname !== AGENT_BOOTSTRAP_PATH) {
        res.writeHead(404);
        res.end();
        return;
    }
    const fetchSite = String(req.headers["sec-fetch-site"] || "");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
        res.writeHead(403);
        res.end();
        return;
    }
    try {
        const config = await manager.ensure();
        const body = JSON.stringify({ ok: true, url: config.url, token: config.token });
        res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store, max-age=0",
            "content-length": String(Buffer.byteLength(body)),
        });
        res.end(body);
    } catch (error) {
        const body = JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Canvas Agent 启动失败" });
        res.writeHead(503, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store, max-age=0",
            "content-length": String(Buffer.byteLength(body)),
        });
        res.end(body);
    }
}

/** Forward the canvas route to an explicitly configured external web service. */
async function proxyCanvas(req, res, canvasUrl) {
    let url;
    try {
        url = new URL(req.url ?? "/", "http://x");
    } catch {
        res.writeHead(400);
        res.end();
        return;
    }
    let targetPath = url.pathname;
    if (targetPath.startsWith(PROXY_PREFIX)) targetPath = targetPath.slice(PROXY_PREFIX.length) || "/";
    let upstream;
    try {
        const base = new URL(canvasUrl);
        if (!base.pathname.endsWith("/")) base.pathname += "/";
        upstream = new URL(`${targetPath.replace(/^\/+/, "")}${url.search}`, base).toString();
    } catch {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end("画布地址配置无效");
        return;
    }
    let outRes;
    try {
        outRes = await fetch(upstream, {
            method: req.method,
            headers: {
                accept: req.headers.accept ?? "*/*",
                "user-agent": req.headers["user-agent"] ?? "dsh-plugin-freecanvas",
                host: new URL(upstream).host,
            },
        });
    } catch {
        res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        res.end("外部 DSH FreeCanvas 服务不可用：请检查插件 canvasUrl 配置");
        return;
    }
    const ct = outRes.headers.get("content-type") ?? "";
    const shouldRewrite = (ct.includes("text/html") || ct.includes("javascript") || ct.includes("application/json")) && (req.method === "GET" || req.method === "HEAD");
    let body = Buffer.from(await outRes.arrayBuffer());
    if (shouldRewrite && body.length < 4 * 1024 * 1024) {
        body = Buffer.from(rewriteCanvasPaths(body.toString("utf8")), "utf8");
    }
    const headers = {};
    for (const [k, v] of outRes.headers) {
        const lk = k.toLowerCase();
        if (!["content-length", "content-encoding", "transfer-encoding", "connection", "keep-alive"].includes(lk)) headers[k] = v;
    }
    headers["content-length"] = String(body.length);
    res.writeHead(outRes.status, headers);
    res.end(body);
}

function serveCanvas(req, res, canvasUrl) {
    const externalUrl = String(canvasUrl || "").trim();
    if (externalUrl) return proxyCanvas(req, res, externalUrl);
    return serveBundledCanvas(req, res);
}

const apply = (ctx, config) => {
    let current = () => config ?? {};
    const agentManager = createAgentManager(() => current()?.autoStartAgent !== false);
    const officialApiProxy = createOfficialApiProxy({
        getConfig: () => resolveOfficialChannelConfig(current()),
    });
    const layoutStateHandler = createLayoutStateHandler();
    const persistentStorageHandler = createPersistentStorageHandler(PERSISTENT_STORAGE_ROOT);
    let disposeSection;
    const sync = () => {
        if (disposeSection !== void 0) {
            disposeSection();
            disposeSection = void 0;
        }
        disposeSection = ctx.systemPrompt.section({
            name: "plugin:dsh-freecanvas",
            order: SECTION_ORDER,
            text: CANVAS_WEB_GUIDANCE,
        });
    };
    installSettingsSection(ctx, CANVAS_WEB_SETTINGS_NAMESPACE, Config, config ?? {}, {
        setSource: (source) => {
            current = source;
        },
        onChange: sync,
    });
    sync();
    ctx.effect(() => {
        if (current()?.autoStartAgent !== false) void agentManager.ensure().catch(() => undefined);
        return () => agentManager.dispose();
    }, "dsh-freecanvas: managed local canvas agent");
    ctx.effect(() => ctx.webServer.register({
        kind: "prefix",
        path: AGENT_BOOTSTRAP_PATH,
        handler: (req, res) => serveAgentBootstrap(req, res, agentManager),
    }), "dsh-freecanvas: local agent bootstrap");
    // Register this more specific route first so the canvas SPA fallback can
    // never receive account or media requests.
    ctx.effect(() => ctx.webServer.register({
        kind: "prefix",
        path: OFFICIAL_API_PREFIX,
        handler: officialApiProxy,
    }), "dsh-freecanvas: official account proxy");
    ctx.effect(() => ctx.webServer.register({
        kind: "prefix",
        path: LAYOUT_STATE_PATH,
        handler: layoutStateHandler,
    }), "dsh-freecanvas: layout preferences");
    ctx.effect(() => ctx.webServer.register({
        kind: "prefix",
        path: PERSISTENT_STORAGE_PATH,
        handler: persistentStorageHandler,
    }), "dsh-freecanvas: browser data persistence");
    // Serve the packaged canvas on the DSH origin. An explicit canvasUrl keeps
    // the same browser path but switches the handler to external proxy mode.
    ctx.effect(() => ctx.webServer.register({
        kind: "prefix",
        path: PROXY_PREFIX,
        handler: (req, res) => serveCanvas(req, res, current()?.canvasUrl),
    }), "dsh-freecanvas: bundled canvas");
};

// Cordis reads `plugin.inject` when the plugin is registered; attach it at
// module scope so it is present before `apply` is invoked.
apply.inject = inject;

export { apply, AGENT_BOOTSTRAP_PATH, CANVAS_PATH, CANVAS_WEB_GUIDANCE, LAYOUT_STATE_PATH, OFFICIAL_API_PREFIX, PERSISTENT_STORAGE_PATH, PROXY_PREFIX };
export default apply;
