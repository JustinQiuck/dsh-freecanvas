// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 JustinQiuck

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "dsh-plugin-freecanvas";
const REQUIRED_PACKED_FILES = [
    "CHANGELOG.md",
    "LICENSE",
    "LICENSING.md",
    "README.md",
    "THIRD_PARTY_NOTICES.md",
    "cordis.patch.yml",
    "lib/client.js",
    "lib/index.js",
    "lib/official-account-store.js",
    "lib/official-api-proxy.js",
    "package.json",
    "scripts/build-web.mjs",
    "scripts/verify-dsh-install.mjs",
    "scripts/verify-package.mjs",
    "web/config.js",
    "web/index.html",
];
const REQUIRED_FILE_GROUPS = [
    ["web/assets JavaScript", (file) => /^web\/assets\/.*\.js$/.test(file)],
    ["web/assets CSS", (file) => /^web\/assets\/.*\.css$/.test(file)],
];
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".svg", ".txt", ".yml", ".yaml"]);
const SENSITIVE_PATTERNS = [
    ["OpenAI-style credential", /\bsk-[A-Za-z0-9]{32,}\b/],
    ["literal bearer credential", /\bBearer\s+[A-Za-z0-9._~+/-]{32,}\b/i],
    ["assigned KIE credential", /\bKIE(?:_API)?_KEY\b\s*[:=]\s*["'`][^\s"'`]{16,}["'`]/i],
    ["literal pairing or card credential", /\b(?:pair_code|card_code)\b\s*[:=]\s*["'`][A-Za-z0-9_-]{32,}["'`]/i],
];

function expect(errors, condition, message) {
    if (!condition) errors.push(message);
}

export function validateReleaseContract({ manifest, patchText, packedFiles }) {
    const errors = [];
    const files = new Set(packedFiles || []);
    const included = new Set(manifest?.files || []);
    expect(errors, manifest?.name === PACKAGE_NAME, `package name must be ${PACKAGE_NAME}`);
    expect(errors, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest?.version || ""), "package version must be semver");
    expect(errors, manifest?.license === "Elastic-2.0", "package license must be Elastic-2.0");
    expect(errors, manifest?.type === "module", "package type must be module");
    expect(errors, manifest?.main === "./lib/index.js" && manifest?.exports?.["."] === "./lib/index.js", "host export must be ./lib/index.js");
    expect(errors, manifest?.exports?.["./client"] === "./lib/client.js", "client export must be ./lib/client.js");
    expect(errors, manifest?.exports?.["./package.json"] === "./package.json", "package.json export is required");
    expect(errors, manifest?.dsh?.bundle?.patch === "./cordis.patch.yml", "dsh.bundle.patch must reference ./cordis.patch.yml");
    expect(errors, manifest?.dsh?.client?.platform === "web", "dsh.client.platform must be web");
    expect(errors, manifest?.publishConfig?.access === "public", "publishConfig.access must be public");
    expect(errors, manifest?.private !== true, "package must not be private");
    expect(errors, manifest?.scripts?.prepack === "npm run build:web", "prepack must build the bundled web app");
    expect(errors, manifest?.scripts?.["verify:package"] === "node ./scripts/verify-package.mjs", "verify:package script is required");
    expect(errors, manifest?.repository?.url === "git+https://github.com/JustinQiuck/dsh-freecanvas.git" && manifest?.repository?.directory === "plugins/dsh-freecanvas", "repository metadata must point to the plugin directory");
    expect(errors, manifest?.homepage?.startsWith("https://github.com/JustinQiuck/dsh-freecanvas/"), "homepage must use the DSH FreeCanvas repository");
    expect(errors, manifest?.bugs?.url === "https://github.com/JustinQiuck/dsh-freecanvas/issues", "bugs URL must use the DSH FreeCanvas repository");
    expect(errors, manifest?.engines?.node === "^22.19.0 || >=24.0.0", "Node engine range must match DSH");
    expect(errors, manifest?.dependencies?.["@basketikun/canvas-agent"] === "0.6.0", "Canvas Agent must remain pinned for repeatable installs");
    expect(errors, manifest?.peerDependencies?.["@deepseek-ai/schemastery"] === "^3.18.1", "schemastery peer range is required");
    expect(errors, manifest?.peerDependencies?.["@deepseek-ai/dsh-settings"]?.includes("^0.1.1-rc.1"), "DSH settings compatibility must include the current 0.1.1 release line");
    for (const file of ["lib", "scripts", "web", "cordis.patch.yml", "README.md", "CHANGELOG.md", "LICENSE", "LICENSING.md", "THIRD_PARTY_NOTICES.md"]) {
        expect(errors, included.has(file), `package files must include ${file}`);
    }
    expect(errors, /^\s*-\s+id:\s+ui-dsh-freecanvas\s*$/m.test(patchText || ""), "bundle patch must insert ui-dsh-freecanvas");
    expect(errors, new RegExp(`^\\s+name:\\s+['\"]?${PACKAGE_NAME}['\"]?\\s*$`, "m").test(patchText || ""), `bundle patch must load ${PACKAGE_NAME}`);
    for (const file of REQUIRED_PACKED_FILES) expect(errors, files.has(file), `packed artifact is missing ${file}`);
    for (const [label, matches] of REQUIRED_FILE_GROUPS) expect(errors, packedFiles?.some(matches), `packed artifact is missing ${label}`);
    expect(errors, !packedFiles?.some((file) => file.endsWith(".tgz")), "packed artifact must not contain a nested tarball");
    return errors;
}

export function findSensitiveLiterals(file, text) {
    return SENSITIVE_PATTERNS
        .filter(([, pattern]) => pattern.test(text))
        .map(([kind]) => ({ file, kind }));
}

function dryRunPack(packageRoot) {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(npm, ["pack", "--dry-run", "--ignore-scripts", "--json"], {
        cwd: packageRoot,
        encoding: "utf8",
        env: { ...process.env, npm_config_loglevel: "error" },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("npm pack dry-run failed");
    let report;
    try {
        [report] = JSON.parse(result.stdout);
    } catch {
        throw new Error("npm pack dry-run returned invalid JSON");
    }
    if (!report || !Array.isArray(report.files)) throw new Error("npm pack dry-run returned no file list");
    return report.files.map(({ path: file }) => file).sort();
}

async function readPackedTexts(packageRoot, packedFiles) {
    const root = path.resolve(packageRoot);
    const entries = [];
    for (const file of packedFiles) {
        if (!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
        const absolute = path.resolve(root, file);
        if (!absolute.startsWith(`${root}${path.sep}`)) throw new Error("npm pack returned an unsafe file path");
        entries.push([file, await fs.readFile(absolute, "utf8")]);
    }
    return entries;
}

export async function inspectReleaseCandidate(packageRoot) {
    const manifest = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
    const patchText = await fs.readFile(path.join(packageRoot, "cordis.patch.yml"), "utf8");
    const packedFiles = dryRunPack(packageRoot);
    const errors = validateReleaseContract({ manifest, patchText, packedFiles });
    for (const [file, text] of await readPackedTexts(packageRoot, packedFiles)) {
        for (const finding of findSensitiveLiterals(file, text)) errors.push(`sensitive literal detected: ${finding.kind} in ${finding.file}`);
    }
    return { manifest, packedFiles, errors };
}

async function main() {
    const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const result = await inspectReleaseCandidate(packageRoot);
    if (result.errors.length) {
        for (const error of result.errors) console.error(`- ${error}`);
        process.exitCode = 1;
        return;
    }
    console.log(`Verified ${result.manifest.name}@${result.manifest.version}: ${result.packedFiles.length} packed files.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : "package verification failed");
        process.exitCode = 1;
    });
}
