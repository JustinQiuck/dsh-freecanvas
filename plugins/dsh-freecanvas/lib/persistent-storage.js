// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 JustinQiuck

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PERSISTENT_STORAGE_PATH = "/dsh-freecanvas-storage";

const STORAGE_HEADER = "dsh-freecanvas-storage";
const STORAGE_VERSION = 1;
const MAX_HEADER_BYTES = 4096;
const MAX_ITEM_BYTES = 128 * 1024 * 1024;
const MAX_STORE_LENGTH = 256;
const MAX_KEY_LENGTH = 512;
const STORAGE_RESPONSE_HEADER = "x-dsh-freecanvas-storage";
const STORE_INITIALIZED_HEADER = "x-dsh-freecanvas-store-initialized";
const VALUE_TYPE_HEADER = "x-dsh-freecanvas-value-type";

function hash(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function decodeIdentifier(value, maxLength) {
    let decoded;
    try {
        decoded = decodeURIComponent(value);
    } catch {
        throw new Error("invalid identifier");
    }
    if (!decoded || decoded.length > maxLength || /[\0-\x1f\x7f]/.test(decoded)) throw new Error("invalid identifier");
    return decoded;
}

function storageHeaders(initialized, extra = {}) {
    return {
        [STORAGE_RESPONSE_HEADER]: "1",
        [STORE_INITIALIZED_HEADER]: initialized ? "1" : "0",
        "cache-control": "no-store, max-age=0",
        "x-content-type-options": "nosniff",
        ...extra,
    };
}

function sendText(res, status, message, initialized = false, extra = {}) {
    const body = Buffer.from(message, "utf8");
    res.writeHead(status, storageHeaders(initialized, {
        "content-type": "text/plain; charset=utf-8",
        "content-length": String(body.length),
        ...extra,
    }));
    res.end(body);
}

function sendJson(res, status, value, initialized) {
    const body = Buffer.from(JSON.stringify(value), "utf8");
    res.writeHead(status, storageHeaders(initialized, {
        "content-type": "application/json; charset=utf-8",
        "content-length": String(body.length),
    }));
    res.end(body);
}

function storeDirectory(root, store) {
    return path.join(root, hash(store));
}

function itemPath(root, store, key) {
    return path.join(storeDirectory(root, store), `${hash(key)}.item`);
}

function ensurePrivateDirectory(directory) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("storage directory is not private");
    fs.chmodSync(directory, 0o700);
}

function readItemHeader(filename) {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("invalid storage item");
    const descriptor = fs.openSync(filename, "r");
    try {
        const headerBuffer = Buffer.alloc(Math.min(MAX_HEADER_BYTES, stat.size));
        const bytes = fs.readSync(descriptor, headerBuffer, 0, headerBuffer.length, 0);
        const newline = headerBuffer.subarray(0, bytes).indexOf(0x0a);
        if (newline < 0) throw new Error("invalid storage header");
        const header = JSON.parse(headerBuffer.subarray(0, newline).toString("utf8"));
        if (header?.app !== STORAGE_HEADER || header.version !== STORAGE_VERSION || !["json", "blob"].includes(header.kind)) throw new Error("invalid storage header");
        return { header, offset: newline + 1, bytes: stat.size - newline - 1 };
    } finally {
        fs.closeSync(descriptor);
    }
}

function listStoreKeys(root, store) {
    const directory = storeDirectory(root, store);
    if (!fs.existsSync(directory)) return { initialized: false, keys: [] };
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("invalid storage directory");
    const keys = [];
    for (const name of fs.readdirSync(directory)) {
        if (!name.endsWith(".item")) continue;
        try {
            const { header } = readItemHeader(path.join(directory, name));
            if (header.store === store && typeof header.key === "string") keys.push(header.key);
        } catch {
            // Ignore damaged or unrelated entries without exposing their contents.
        }
    }
    return { initialized: true, keys: keys.sort() };
}

function writeItem(root, store, key, kind, mimeType, body) {
    const directory = storeDirectory(root, store);
    ensurePrivateDirectory(root);
    ensurePrivateDirectory(directory);
    const filename = itemPath(root, store, key);
    const temporary = path.join(directory, `.${path.basename(filename)}.${process.pid}.${crypto.randomUUID()}.tmp`);
    const header = Buffer.from(`${JSON.stringify({ app: STORAGE_HEADER, version: STORAGE_VERSION, store, key, kind, mimeType })}\n`, "utf8");
    try {
        fs.writeFileSync(temporary, Buffer.concat([header, body]), { flag: "wx", mode: 0o600 });
        fs.chmodSync(temporary, 0o600);
        fs.renameSync(temporary, filename);
        fs.chmodSync(filename, 0o600);
    } finally {
        try {
            fs.unlinkSync(temporary);
        } catch (error) {
            if (error?.code !== "ENOENT") throw error;
        }
    }
}

function removeItem(root, store, key) {
    const directory = storeDirectory(root, store);
    ensurePrivateDirectory(root);
    ensurePrivateDirectory(directory);
    const filename = itemPath(root, store, key);
    try {
        if (fs.lstatSync(filename).isSymbolicLink()) throw new Error("invalid storage item");
        fs.unlinkSync(filename);
    } catch (error) {
        if (error?.code !== "ENOENT") throw error;
    }
}

function clearStore(root, store) {
    const directory = storeDirectory(root, store);
    ensurePrivateDirectory(root);
    ensurePrivateDirectory(directory);
    for (const name of fs.readdirSync(directory)) {
        if (!name.endsWith(".item")) continue;
        const filename = path.join(directory, name);
        if (fs.lstatSync(filename).isSymbolicLink()) throw new Error("invalid storage item");
        fs.unlinkSync(filename);
    }
}

async function readBody(req) {
    const declared = Number(req.headers["content-length"] || 0);
    if (Number.isFinite(declared) && declared > MAX_ITEM_BYTES) throw Object.assign(new Error("too large"), { status: 413 });
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_ITEM_BYTES) throw Object.assign(new Error("too large"), { status: 413 });
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function parseRequest(req) {
    const requestUrl = new URL(req.url ?? "/", "http://x");
    if (requestUrl.search || !requestUrl.pathname.startsWith(`${PERSISTENT_STORAGE_PATH}/`)) throw Object.assign(new Error("not found"), { status: 404 });
    const segments = requestUrl.pathname.slice(PERSISTENT_STORAGE_PATH.length + 1).split("/");
    if (segments.length < 1 || segments.length > 2 || segments.some((item) => !item)) throw Object.assign(new Error("not found"), { status: 404 });
    return {
        store: decodeIdentifier(segments[0], MAX_STORE_LENGTH),
        key: segments[1] ? decodeIdentifier(segments[1], MAX_KEY_LENGTH) : undefined,
    };
}

function requestAllowed(req) {
    const fetchSite = String(req.headers["sec-fetch-site"] || "");
    return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}

export function createPersistentStorageHandler(root) {
    return async (req, res) => {
        if (!requestAllowed(req)) {
            sendText(res, 403, "Forbidden");
            return;
        }
        let target;
        try {
            target = parseRequest(req);
        } catch (error) {
            sendText(res, error?.status || 400, error?.status === 404 ? "Not Found" : "Bad Request");
            return;
        }
        const initialized = fs.existsSync(storeDirectory(root, target.store));
        try {
            if (!target.key) {
                if (req.method === "GET") {
                    const listed = listStoreKeys(root, target.store);
                    sendJson(res, 200, { keys: listed.keys, initialized: listed.initialized }, listed.initialized);
                    return;
                }
                if (req.method === "DELETE") {
                    clearStore(root, target.store);
                    res.writeHead(204, storageHeaders(true));
                    res.end();
                    return;
                }
                sendText(res, 405, "Method Not Allowed", initialized, { allow: "GET, DELETE" });
                return;
            }
            const filename = itemPath(root, target.store, target.key);
            if (req.method === "GET") {
                if (!fs.existsSync(filename)) {
                    sendText(res, 404, "Not Found", initialized);
                    return;
                }
                const { header, offset, bytes } = readItemHeader(filename);
                if (header.store !== target.store || header.key !== target.key) throw new Error("storage item collision");
                res.writeHead(200, storageHeaders(true, {
                    "content-type": header.kind === "blob" ? header.mimeType || "application/octet-stream" : "application/json; charset=utf-8",
                    "content-length": String(bytes),
                    [VALUE_TYPE_HEADER]: header.kind,
                }));
                fs.createReadStream(filename, { start: offset }).on("error", () => res.destroy()).pipe(res);
                return;
            }
            if (req.method === "PUT") {
                const kind = String(req.headers[VALUE_TYPE_HEADER] || "");
                if (!["json", "blob"].includes(kind)) {
                    sendText(res, 415, "Unsupported Media Type", initialized);
                    return;
                }
                const body = await readBody(req);
                if (kind === "json") JSON.parse(body.toString("utf8"));
                const mimeType = kind === "blob" ? String(req.headers["content-type"] || "application/octet-stream").slice(0, 200) : "application/json";
                writeItem(root, target.store, target.key, kind, mimeType, body);
                res.writeHead(204, storageHeaders(true));
                res.end();
                return;
            }
            if (req.method === "DELETE") {
                removeItem(root, target.store, target.key);
                res.writeHead(204, storageHeaders(true));
                res.end();
                return;
            }
            sendText(res, 405, "Method Not Allowed", initialized, { allow: "GET, PUT, DELETE" });
        } catch (error) {
            const status = error?.status || (error instanceof SyntaxError ? 400 : 500);
            sendText(res, status, status === 413 ? "Payload Too Large" : status === 400 ? "Bad Request" : "Storage Error", initialized);
        }
    };
}
