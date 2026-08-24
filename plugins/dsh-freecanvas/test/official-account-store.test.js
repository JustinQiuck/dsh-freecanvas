import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { OfficialAccountStore, OfficialAccountStoreError } from "../lib/official-account-store.js";

const token = `sk-${"a".repeat(48)}`;
const expiresAt = "2030-01-01T00:00:00.000Z";

async function temporaryStore(options = {}) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-freecanvas-account-"));
    return {
        directory,
        store: new OfficialAccountStore({ directory, now: () => Date.parse("2029-01-01T00:00:00.000Z"), ...options }),
    };
}

test("official account storage writes atomically with private permissions", async (t) => {
    const { directory, store } = await temporaryStore();
    t.after(() => fs.rm(directory, { recursive: true, force: true }));

    await store.save({ version: 1, accessToken: token, expiresAt });
    assert.deepEqual(await store.read(), {
        state: "connected",
        account: { version: 1, accessToken: token, expiresAt },
    });
    assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(store.filePath)).mode & 0o777, 0o600);
});

test("a damaged account file is never overwritten", async (t) => {
    const { directory, store } = await temporaryStore();
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(store.filePath, "not-json", "utf8");

    await assert.rejects(
        store.save({ version: 1, accessToken: token, expiresAt }),
        (error) => error instanceof OfficialAccountStoreError && error.code === "damaged",
    );
    assert.equal(await fs.readFile(store.filePath, "utf8"), "not-json");
});

test("expired credentials are retained but never reported as connected", async (t) => {
    const { directory, store } = await temporaryStore({ now: () => Date.parse("2031-01-01T00:00:00.000Z") });
    t.after(() => fs.rm(directory, { recursive: true, force: true }));

    await store.save({ version: 1, accessToken: token, expiresAt });
    assert.equal((await store.read()).state, "expired");
});

test("concurrent saves leave one complete credential record", async (t) => {
    const { directory, store } = await temporaryStore();
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const secondToken = `sk-${"b".repeat(48)}`;

    await Promise.all([
        store.save({ version: 1, accessToken: token, expiresAt }),
        store.save({ version: 1, accessToken: secondToken, expiresAt }),
    ]);
    const result = await store.read();
    assert.equal(result.state, "connected");
    assert.ok([token, secondToken].includes(result.account.accessToken));
});
