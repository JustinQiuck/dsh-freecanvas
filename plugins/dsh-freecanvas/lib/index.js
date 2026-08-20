// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 JustinQiuck

import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";

/**
 * dsh-plugin-freecanvas host half.
 *
 * Registers a settings namespace exposing the canvas URL the browser half
 * embeds, plus a model-facing guidance section. Also registers the
 * `/canvas-proxy` reverse-proxy route: DSH's Electron webview refuses every
 * cross-origin iframe navigation (verified empirically: same-origin iframes
 * navigate, cross-origin/data:/public all stay about:blank), so the browser
 * half must load the canvas through a SAME-ORIGIN path. The proxy forwards
 * to the local canvas service (127.0.0.1:3000) and rewrites Vite's
 * absolute asset paths (`/src/...`, `/@vite/...`, `/config.js`, ...) into the
 * `/canvas-proxy` prefix so the canvas app bootstraps under the DSH origin.
 */

export const CANVAS_WEB_SETTINGS_NAMESPACE = settingsNamespace("dsh-freecanvas");

const DEFAULT_CANVAS_URL = "http://127.0.0.1:3000";
const PROXY_PREFIX = "/canvas-proxy";
const AGENT_BOOTSTRAP_PATH = "/canvas-agent-bootstrap";
const AGENT_CONFIG_FILE = path.join(os.homedir(), ".infinite-canvas", "canvas-agent.json");
const require = createRequire(import.meta.url);
const AGENT_ENTRY = require.resolve("@basketikun/canvas-agent");

export const Config = z.object({
    canvasUrl: z.string().default(DEFAULT_CANVAS_URL),
    autoStartAgent: z.boolean().default(true),
});

/** Services injected into this plugin by the harness (webServer: proxy route). */
const inject = ["systemPrompt", "webServer"];

/** Model-facing announcement: plugin presence and capabilities. */
const CANVAS_WEB_GUIDANCE = "本机已安装 dsh-plugin-freecanvas：侧边栏「DSH FreeCanvas」入口可在 DSH 内嵌画布；配合 Canvas Agent 与 dsh-mcp-client，可让 agent 读取画布、创建节点、连接流程并触发生成。";

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 210;

/**
 * vite 资源路径重写：`"/src/main.tsx"`、`/@vite/client`、`/config.js` 等
 * 绝对路径一律加 `/canvas-proxy` 前缀，使画布页面在同源代理下自举。
 */
// Only rewrite quote-delimited paths. Matching `(` would also match JavaScript
// regex literals such as `replace(/@vite\/client$/, "")` and corrupt the script.
const REWRITE_RE = /(["'`])(\/(?:src|@vite|@react-refresh|node_modules|plugins|config\.js|logo\.svg|favicon\.svg|manifest\.webmanifest)[^"'`) ]*)/g;

function rewriteCanvasPaths(text) {
    return text.replace(REWRITE_RE, (whole, quote, path) => quote + PROXY_PREFIX + path);
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
            child = spawn(process.execPath, [AGENT_ENTRY], {
                cwd: os.homedir(),
                env: process.env,
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

/** Forward a `/canvas-proxy/*` request to the local canvas dev server. */
async function proxyCanvas(req, res, canvasUrl = DEFAULT_CANVAS_URL) {
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
        const base = new URL(canvasUrl || DEFAULT_CANVAS_URL);
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
        res.end("DSH FreeCanvas 未运行：请先启动项目服务（默认端口 3000）后重试");
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

const apply = (ctx, config) => {
    let current = () => config ?? {};
    const agentManager = createAgentManager(() => current()?.autoStartAgent !== false);
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
    // Same-origin reverse proxy so the canvas web app can be embedded in the
    // iframe (cross-origin iframe navigation is refused by this Electron build).
    ctx.effect(() => ctx.webServer.register({
        kind: "prefix",
        path: PROXY_PREFIX,
        handler: (req, res) => proxyCanvas(req, res, current()?.canvasUrl),
    }), "dsh-freecanvas: same-origin proxy");
};

// Cordis reads `plugin.inject` when the plugin is registered; attach it at
// module scope so it is present before `apply` is invoked.
apply.inject = inject;

export { apply, AGENT_BOOTSTRAP_PATH, CANVAS_WEB_GUIDANCE, PROXY_PREFIX };
export default apply;
