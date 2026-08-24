// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 JustinQiuck

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "dsh-plugin-freecanvas";
const ENTRY_ID = "ui-dsh-freecanvas";
const PROFILE_PATCH = `- id: ${ENTRY_ID}\n  config:\n    autoStartAgent: false\n    officialChannelEnabled: false\n    officialChannelSingleUserMode: false\n    officialChannelDevelopmentMode: false\n    officialApiUrl: ''\n    officialAccountPortalUrl: ''\n`;
const PUBLIC_STATUS_KEYS = ["account_portal_url", "connected", "enabled", "token_expires_at"];

function countMatches(text, pattern) {
    return [...String(text).matchAll(pattern)].length;
}

export function assertSingleFreeCanvasConfig(dump, installed) {
    const count = countMatches(dump, /^\s+name:\s+['"]?dsh-plugin-freecanvas['"]?\s*$/gm);
    if (count !== (installed ? 1 : 0)) throw new Error(`FreeCanvas config must appear exactly once when installed=${installed}`);
}

export function assertBundleManifest(manifest, installed) {
    const bundles = manifest?.dsh?.profile?.bundles;
    if (!Array.isArray(bundles)) throw new Error("DSH profile bundle manifest is missing");
    const count = bundles.filter((bundle) => bundle === PACKAGE_NAME).length;
    if (count !== (installed ? 1 : 0)) throw new Error(`FreeCanvas bundle must appear exactly once when installed=${installed}`);
}

export function assertDisabledOfficialStatus(value) {
    const keys = Object.keys(value || {}).sort();
    if (keys.join("\n") !== PUBLIC_STATUS_KEYS.join("\n")) throw new Error("Official status must expose only public fields");
    if (value.enabled !== false || value.connected !== false || value.account_portal_url !== "" || value.token_expires_at !== "") {
        throw new Error("Official channel must remain disabled in clean-install verification");
    }
}

export function createLifecycleCommands({ tarball, profile = "web" }) {
    return {
        bootstrap: ["--profile", profile, "--dump-config"],
        install: ["plugin", "--profile", profile, "add", tarball],
        inspect: ["--profile", profile, "--dump-config"],
        remove: ["plugin", "--profile", profile, "remove", PACKAGE_NAME],
    };
}

function commandEnv(dshHome) {
    return { ...process.env, DSH_HOME: dshHome, DSH_TELEMETRY_MODE: "DISABLED", CI: "1" };
}

function run(binary, args, { cwd, dshHome }) {
    const result = spawnSync(binary, args, {
        cwd,
        env: commandEnv(dshHome),
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        const detail = String(result.stderr || result.stdout || "").trim().slice(-4000);
        throw new Error(`command failed: ${path.basename(binary)} ${args.join(" ")}${detail ? `\n${detail}` : ""}`);
    }
    return result.stdout;
}

async function packCandidate(packageRoot, artifactDirectory) {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    run(npm, ["pack", "--pack-destination", artifactDirectory], { cwd: packageRoot, dshHome: artifactDirectory });
    const tarballs = (await fs.readdir(artifactDirectory)).filter((file) => file.endsWith(".tgz"));
    if (tarballs.length !== 1) throw new Error("npm pack must create exactly one candidate tarball");
    return path.join(artifactDirectory, tarballs[0]);
}

async function profileManifest(dshHome, profile) {
    return JSON.parse(await fs.readFile(path.join(dshHome, "profiles", profile, "package.json"), "utf8"));
}

function assertOnlyBundleChanged(before, after, installed) {
    const withoutFreeCanvas = (manifest) => manifest.dsh.profile.bundles.filter((bundle) => bundle !== PACKAGE_NAME);
    assertBundleManifest(before, false);
    assertBundleManifest(after, installed);
    if (JSON.stringify(withoutFreeCanvas(after)) !== JSON.stringify(withoutFreeCanvas(before))) {
        throw new Error("FreeCanvas lifecycle changed unrelated profile bundles");
    }
}

function assertInstalledRuntimeDependency(dshHome, profile) {
    const profileDirectory = path.join(dshHome, "profiles", profile);
    const require = createRequire(path.join(profileDirectory, "package.json"));
    const pluginManifest = require.resolve(`${PACKAGE_NAME}/package.json`);
    createRequire(pluginManifest).resolve("@basketikun/canvas-agent");
}

function assertPluginRemoved(dshHome, profile) {
    const require = createRequire(path.join(dshHome, "profiles", profile, "package.json"));
    try {
        require.resolve(`${PACKAGE_NAME}/package.json`);
    } catch {
        return;
    }
    throw new Error("FreeCanvas package remains resolvable after removal");
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            server.close((error) => error ? reject(error) : resolve(address.port));
        });
    });
}

function request(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { headers: { "sec-fetch-site": "same-origin" } }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers }));
        });
        req.once("error", reject);
        req.setTimeout(5000, () => req.destroy(new Error(`request timed out: ${url}`)));
    });
}

async function waitForPage(origin, pathname, child, startupError, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        if (startupError.value) throw startupError.value;
        if (child.exitCode !== null) throw new Error("DSH Web exited before the bundled canvas became ready");
        try {
            const response = await request(`${origin}${pathname}`);
            if (response.status === 200) return response;
            lastError = new Error(`${pathname} returned ${response.status}`);
        } catch (error) {
            lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw lastError || new Error("timed out waiting for DSH Web");
}

async function stop(child) {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (child.exitCode !== null) return;
    child.kill("SIGKILL");
    await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
}

function startWeb(binary, { cwd, dshHome, profile, port }) {
    const args = ["--profile", profile, "--host", "127.0.0.1", "--port", String(port)];
    const child = spawn(binary, args, { cwd, env: commandEnv(dshHome), stdio: ["ignore", "pipe", "pipe"] });
    const startupError = { value: null };
    let logs = "";
    const collect = (chunk) => { logs = `${logs}${chunk}`.slice(-8000); };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", (error) => { startupError.value = error; });
    return { child, startupError, logs: () => logs };
}

async function verifyWeb(binary, options) {
    const { cwd, dshHome, profile } = options;
    const port = await freePort();
    const process = startWeb(binary, { ...options, port });
    try {
        const origin = `http://127.0.0.1:${port}`;
        const page = await waitForPage(origin, "/dsh-freecanvas/", process.child, process.startupError);
        if (!page.body.includes("/dsh-freecanvas/") || !page.body.includes("<script")) throw new Error("bundled canvas page is incomplete");
        const assetPath = page.body.match(/(?:src|href)="([^"]+\.(?:js|css))"/)?.[1];
        if (!assetPath) throw new Error("bundled canvas page references no static asset");
        const asset = await request(new URL(assetPath, origin).toString());
        if (asset.status !== 200 || asset.body.length === 0) throw new Error("bundled canvas static asset is unavailable");
        const status = await request(`${origin}/dsh-freecanvas/official-api/status`);
        if (status.status !== 200) throw new Error("official status endpoint is unavailable");
        assertDisabledOfficialStatus(JSON.parse(status.body));
    } catch (error) {
        const logs = process.logs();
        throw new Error(`${error instanceof Error ? error.message : "DSH Web verification failed"}${logs ? `\n${logs}` : ""}`);
    } finally {
        await stop(process.child);
    }
}

async function verifyBaseWeb(binary, options) {
    const port = await freePort();
    const process = startWeb(binary, { ...options, port });
    try {
        const page = await waitForPage(`http://127.0.0.1:${port}`, "/", process.child, process.startupError);
        if (!page.body.includes("<script")) throw new Error("base DSH Web page is incomplete after uninstall");
    } catch (error) {
        const logs = process.logs();
        throw new Error(`${error instanceof Error ? error.message : "base DSH Web verification failed"}${logs ? `\n${logs}` : ""}`);
    } finally {
        await stop(process.child);
    }
}

export async function verifyDshInstall({ packageRoot, dshBinary = process.env.DSH_CLI_BIN || "dsh", profile = "web" }) {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-freecanvas-install-"));
    const dshHome = path.join(temporary, "dsh-home");
    const artifacts = path.join(temporary, "artifacts");
    await fs.mkdir(artifacts, { recursive: true });
    try {
        const tarball = await packCandidate(packageRoot, artifacts);
        const commands = createLifecycleCommands({ tarball, profile });
        const baselineDump = run(dshBinary, commands.bootstrap, { cwd: packageRoot, dshHome });
        assertSingleFreeCanvasConfig(baselineDump, false);
        const baselineManifest = await profileManifest(dshHome, profile);
        const profilePatchPath = path.join(dshHome, "profiles", profile, "cordis.patch.yml");
        const baselinePatch = await fs.readFile(profilePatchPath, "utf8");
        run(dshBinary, commands.install, { cwd: packageRoot, dshHome });
        const installedManifest = await profileManifest(dshHome, profile);
        assertOnlyBundleChanged(baselineManifest, installedManifest, true);
        assertInstalledRuntimeDependency(dshHome, profile);
        run(dshBinary, commands.install, { cwd: packageRoot, dshHome });
        const reinstalledManifest = await profileManifest(dshHome, profile);
        assertOnlyBundleChanged(baselineManifest, reinstalledManifest, true);
        await fs.writeFile(profilePatchPath, PROFILE_PATCH, "utf8");
        const installedDump = run(dshBinary, commands.inspect, { cwd: packageRoot, dshHome });
        assertSingleFreeCanvasConfig(installedDump, true);
        await verifyWeb(dshBinary, { cwd: packageRoot, dshHome, profile });
        await fs.writeFile(profilePatchPath, baselinePatch, "utf8");
        run(dshBinary, commands.remove, { cwd: packageRoot, dshHome });
        const removedManifest = await profileManifest(dshHome, profile);
        assertOnlyBundleChanged(baselineManifest, removedManifest, false);
        assertPluginRemoved(dshHome, profile);
        const removedDump = run(dshBinary, commands.inspect, { cwd: packageRoot, dshHome });
        assertSingleFreeCanvasConfig(removedDump, false);
        await verifyBaseWeb(dshBinary, { cwd: packageRoot, dshHome, profile });
        return { profile, packageName: PACKAGE_NAME };
    } finally {
        await fs.rm(temporary, { recursive: true, force: true });
    }
}

async function main() {
    const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const result = await verifyDshInstall({ packageRoot });
    console.log(`Verified ${result.packageName} install, boot, and removal in disposable DSH profile ${result.profile}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : "DSH install verification failed");
        process.exitCode = 1;
    });
}
