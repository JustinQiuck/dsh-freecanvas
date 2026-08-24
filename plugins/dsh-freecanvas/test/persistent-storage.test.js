import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createPersistentStorageHandler, PERSISTENT_STORAGE_PATH } from "../lib/persistent-storage.js";

async function withServer(handler, run) {
    const server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    try {
        return await run(origin);
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
}

function itemUrl(origin, store, key) {
    return `${origin}${PERSISTENT_STORAGE_PATH}/${encodeURIComponent(store)}/${encodeURIComponent(key)}`;
}

test("host storage preserves JSON and blobs across changing browser origins", async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-freecanvas-storage-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const store = "infinite-canvas:app_state";
    const stateKey = "infinite-canvas:canvas_store";
    const state = { state: { projects: [{ id: "project-1", title: "Canvas" }] }, version: 0 };

    await withServer(createPersistentStorageHandler(root), async (origin) => {
        const initial = await fetch(`${origin}${PERSISTENT_STORAGE_PATH}/${encodeURIComponent(store)}`);
        assert.deepEqual(await initial.json(), { keys: [], initialized: false });

        const saved = await fetch(itemUrl(origin, store, stateKey), {
            method: "PUT",
            headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-dsh-freecanvas-value-type": "json" },
            body: JSON.stringify(state),
        });
        assert.equal(saved.status, 204);

        const [storeName] = await fs.readdir(root);
        const [itemName] = await fs.readdir(path.join(root, storeName));
        assert.equal((await fs.stat(root)).mode & 0o777, 0o700);
        assert.equal((await fs.stat(path.join(root, storeName))).mode & 0o777, 0o700);
        assert.equal((await fs.stat(path.join(root, storeName, itemName))).mode & 0o777, 0o600);
    });

    await withServer(createPersistentStorageHandler(root), async (origin) => {
        const restored = await fetch(itemUrl(origin, store, stateKey));
        assert.equal(restored.status, 200);
        assert.equal(restored.headers.get("x-dsh-freecanvas-store-initialized"), "1");
        assert.deepEqual(await restored.json(), state);

        const blob = Buffer.from([0, 1, 2, 3, 255]);
        const savedBlob = await fetch(itemUrl(origin, "infinite-canvas:image_files", "image:one"), {
            method: "PUT",
            headers: { "content-type": "image/png", "x-dsh-freecanvas-value-type": "blob" },
            body: blob,
        });
        assert.equal(savedBlob.status, 204);
        const restoredBlob = await fetch(itemUrl(origin, "infinite-canvas:image_files", "image:one"));
        assert.equal(restoredBlob.headers.get("content-type"), "image/png");
        assert.deepEqual(Buffer.from(await restoredBlob.arrayBuffer()), blob);
    });
});

test("host storage lists, deletes, and clears without reviving stale origin data", async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-freecanvas-storage-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const store = "infinite-canvas:image_generation_logs";

    await withServer(createPersistentStorageHandler(root), async (origin) => {
        for (const key of ["log-b", "log-a"]) {
            const response = await fetch(itemUrl(origin, store, key), {
                method: "PUT",
                headers: { "content-type": "application/json", "x-dsh-freecanvas-value-type": "json" },
                body: JSON.stringify({ id: key }),
            });
            assert.equal(response.status, 204);
        }
        const listed = await fetch(`${origin}${PERSISTENT_STORAGE_PATH}/${encodeURIComponent(store)}`);
        assert.deepEqual(await listed.json(), { keys: ["log-a", "log-b"], initialized: true });

        assert.equal((await fetch(itemUrl(origin, store, "log-a"), { method: "DELETE" })).status, 204);
        assert.equal((await fetch(itemUrl(origin, store, "log-a"))).status, 404);
        assert.equal((await fetch(`${origin}${PERSISTENT_STORAGE_PATH}/${encodeURIComponent(store)}`, { method: "DELETE" })).status, 204);
        const empty = await fetch(`${origin}${PERSISTENT_STORAGE_PATH}/${encodeURIComponent(store)}`);
        assert.deepEqual(await empty.json(), { keys: [], initialized: true });
    });
});

test("host storage rejects cross-site writes and malformed values", async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-freecanvas-storage-"));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await withServer(createPersistentStorageHandler(root), async (origin) => {
        const url = itemUrl(origin, "infinite-canvas:app_state", "state");
        const crossSite = await fetch(url, {
            method: "PUT",
            headers: { "content-type": "application/json", "sec-fetch-site": "cross-site", "x-dsh-freecanvas-value-type": "json" },
            body: "{}",
        });
        assert.equal(crossSite.status, 403);
        const malformed = await fetch(url, {
            method: "PUT",
            headers: { "content-type": "application/json", "x-dsh-freecanvas-value-type": "json" },
            body: "not-json",
        });
        assert.equal(malformed.status, 400);
        const unknownType = await fetch(url, {
            method: "PUT",
            headers: { "content-type": "application/octet-stream", "x-dsh-freecanvas-value-type": "binary" },
            body: "x",
        });
        assert.equal(unknownType.status, 415);
    });
});
