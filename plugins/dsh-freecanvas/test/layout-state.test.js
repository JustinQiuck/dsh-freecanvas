import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLayoutStateHandler, LAYOUT_STATE_PATH } from "../lib/index.js";

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

test("layout state persists outside the changing browser origin", async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-freecanvas-layout-"));
    const filePath = path.join(directory, "layout.json");
    t.after(() => fs.rm(directory, { recursive: true, force: true }));

    await withServer(createLayoutStateHandler(filePath), async (origin) => {
        const initial = await fetch(`${origin}${LAYOUT_STATE_PATH}`);
        assert.deepEqual(await initial.json(), { active: false, mode: "split" });

        const saved = await fetch(`${origin}${LAYOUT_STATE_PATH}`, {
            method: "PUT",
            headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
            body: JSON.stringify({ active: true, mode: "canvas" }),
        });
        assert.equal(saved.status, 204);

        const restored = await fetch(`${origin}${LAYOUT_STATE_PATH}`);
        assert.deepEqual(await restored.json(), { active: true, mode: "canvas" });
        assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
    });
});

test("layout state rejects cross-site and malformed writes", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-freecanvas-layout-"));
    const filePath = path.join(directory, "layout.json");
    try {
        await withServer(createLayoutStateHandler(filePath), async (origin) => {
            const crossSite = await fetch(`${origin}${LAYOUT_STATE_PATH}`, {
                method: "PUT",
                headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
                body: JSON.stringify({ active: true, mode: "split" }),
            });
            assert.equal(crossSite.status, 403);

            const malformed = await fetch(`${origin}${LAYOUT_STATE_PATH}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ active: true, mode: "conversation" }),
            });
            assert.equal(malformed.status, 400);
        });
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
});
