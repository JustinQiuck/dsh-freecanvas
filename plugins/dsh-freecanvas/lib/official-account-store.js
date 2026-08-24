// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 JustinQiuck

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export const OFFICIAL_ACCOUNT_VERSION = 1;
export const OFFICIAL_ACCOUNT_DIR = ".infinite-canvas";
export const OFFICIAL_ACCOUNT_FILE = "official-account.json";

export class OfficialAccountStoreError extends Error {
    constructor(code, message = code) {
        super(message);
        this.code = code;
    }
}

function isToken(value) {
    return typeof value === "string" && /^sk-[A-Za-z0-9]{32,512}$/.test(value);
}

function isDate(value) {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function normalizeAccount(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)
        || value.version !== OFFICIAL_ACCOUNT_VERSION
        || !isToken(value.accessToken)
        || !isDate(value.expiresAt)) return null;
    return {
        version: OFFICIAL_ACCOUNT_VERSION,
        accessToken: value.accessToken,
        expiresAt: new Date(value.expiresAt).toISOString(),
    };
}

function missing(error) {
    return error && typeof error === "object" && error.code === "ENOENT";
}

export class OfficialAccountStore {
    constructor({ directory = path.join(os.homedir(), OFFICIAL_ACCOUNT_DIR), filename = OFFICIAL_ACCOUNT_FILE, now = () => Date.now() } = {}) {
        this.directory = directory;
        this.filePath = path.join(directory, filename);
        this.now = now;
        this.writeQueue = Promise.resolve();
    }

    async read() {
        let raw;
        try {
            const stat = await fs.lstat(this.filePath);
            if (!stat.isFile() || stat.isSymbolicLink()) return { state: "damaged" };
            raw = await fs.readFile(this.filePath, "utf8");
        } catch (error) {
            if (missing(error)) return { state: "missing" };
            throw new OfficialAccountStoreError("unreadable");
        }
        let account;
        try {
            account = normalizeAccount(JSON.parse(raw));
        } catch {
            account = null;
        }
        if (!account) return { state: "damaged" };
        if (Date.parse(account.expiresAt) <= this.now()) return { state: "expired", account };
        return { state: "connected", account };
    }

    async save(value) {
        const account = normalizeAccount(value);
        if (!account) throw new OfficialAccountStoreError("invalid-account");
        return this.#write(async () => {
            const existing = await this.read();
            if (existing.state === "damaged") throw new OfficialAccountStoreError("damaged");
            await this.#ensureDirectory();
            const tempPath = path.join(this.directory, `.${OFFICIAL_ACCOUNT_FILE}.${crypto.randomUUID()}.tmp`);
            try {
                const handle = await fs.open(tempPath, "wx", 0o600);
                try {
                    await handle.writeFile(`${JSON.stringify(account)}\n`, "utf8");
                    await handle.sync();
                } finally {
                    await handle.close();
                }
                await fs.chmod(tempPath, 0o600);
                await fs.rename(tempPath, this.filePath);
                await fs.chmod(this.filePath, 0o600);
            } catch (error) {
                await fs.unlink(tempPath).catch(() => undefined);
                throw error instanceof OfficialAccountStoreError ? error : new OfficialAccountStoreError("write-failed");
            }
            return account;
        });
    }

    async clear() {
        return this.#write(async () => {
            try {
                const stat = await fs.lstat(this.filePath);
                if (!stat.isFile() || stat.isSymbolicLink()) throw new OfficialAccountStoreError("unsafe-file");
                await fs.unlink(this.filePath);
            } catch (error) {
                if (missing(error)) return false;
                throw error;
            }
            return true;
        });
    }

    async disable() {
        return this.#write(async () => {
            try {
                const stat = await fs.lstat(this.filePath);
                if (!stat.isFile() || stat.isSymbolicLink()) throw new OfficialAccountStoreError("unsafe-file");
            } catch (error) {
                if (missing(error)) return false;
                throw error;
            }
            const disabledPath = path.join(this.directory, `official-account.disabled-${Date.now()}-${crypto.randomUUID()}.json`);
            await fs.rename(this.filePath, disabledPath);
            await fs.chmod(disabledPath, 0o600);
            return true;
        });
    }

    #write(action) {
        const result = this.writeQueue.then(action, action);
        this.writeQueue = result.catch(() => undefined);
        return result;
    }

    async #ensureDirectory() {
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
        const stat = await fs.lstat(this.directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new OfficialAccountStoreError("unsafe-directory");
        await fs.chmod(this.directory, 0o700);
    }
}

export function createOfficialAccountStore(options) {
    return new OfficialAccountStore(options);
}
