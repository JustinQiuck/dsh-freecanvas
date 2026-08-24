// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 JustinQiuck

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "dsh-plugin-freecanvas";
const REPOSITORY_URL = "git+https://github.com/JustinQiuck/dsh-freecanvas.git";
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}`;

function expect(errors, condition, message) {
    if (!condition) errors.push(message);
}

function changelogSection(changelogText, heading) {
    const lines = changelogText.split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
    if (start < 0) return null;
    const next = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
    return lines.slice(start + 1, next < 0 ? undefined : next).join("\n").trim();
}

export function validateReleaseMetadata({ manifest, changelogText, releaseTag }) {
    const errors = [];
    const expectedTag = `${PACKAGE_NAME}@${manifest?.version || ""}`;
    expect(errors, manifest?.name === PACKAGE_NAME, `package name must be ${PACKAGE_NAME}`);
    expect(errors, releaseTag === expectedTag, `release tag must be ${expectedTag}`);
    expect(errors, changelogSection(changelogText, manifest?.version || "") !== null, `CHANGELOG.md must contain ## ${manifest?.version || "<version>"}`);
    expect(errors, changelogSection(changelogText, "Unreleased") === "", "CHANGELOG.md Unreleased section must be empty before publishing");
    return errors;
}

export function validatePublishMode({ authMode, packageExists, versionExists, bootstrapTokenPresent }) {
    const errors = [];
    expect(errors, authMode === "bootstrap-token" || authMode === "trusted-publisher", "NPM_AUTH_MODE must be bootstrap-token or trusted-publisher");
    expect(errors, !versionExists, "this package version already exists and cannot be overwritten");
    if (authMode === "bootstrap-token") {
        expect(errors, !packageExists, "bootstrap-token is only allowed for the first package publication");
        expect(errors, bootstrapTokenPresent, "bootstrap-token mode requires the protected NPM_BOOTSTRAP_TOKEN secret");
    }
    if (authMode === "trusted-publisher") {
        expect(errors, packageExists, "trusted publishing requires the package to already exist on npm");
        expect(errors, !bootstrapTokenPresent, "remove NPM_BOOTSTRAP_TOKEN before using trusted-publisher mode");
    }
    return errors;
}

export function artifactIntegrity(buffer) {
    return `sha512-${createHash("sha512").update(buffer).digest("base64")}`;
}

export function validatePublishedMetadata({ manifest, registryVersion, expectedIntegrity }) {
    const errors = [];
    expect(errors, registryVersion?.name === manifest?.name, "registry package name does not match the candidate");
    expect(errors, registryVersion?.version === manifest?.version, "registry version does not match the candidate");
    expect(errors, registryVersion?.repository?.url === REPOSITORY_URL, "registry repository does not match the candidate");
    expect(errors, registryVersion?.dist?.integrity === expectedIntegrity, "registry tarball integrity does not match the candidate");
    expect(errors, /^https:\/\/registry\.npmjs\.org\/dsh-plugin-freecanvas\/-\//.test(registryVersion?.dist?.tarball || ""), "registry tarball URL is unexpected");
    expect(errors, /^https:\/\/registry\.npmjs\.org\/-\/npm\/v1\/attestations\//.test(registryVersion?.dist?.attestations?.url || ""), "registry provenance attestation is missing");
    expect(errors, /^https:\/\/slsa\.dev\/provenance\//.test(registryVersion?.dist?.attestations?.provenance?.predicateType || ""), "registry provenance predicate is missing");
    return errors;
}

function runGit(repoRoot, args) {
    const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args[0]} failed`);
    return result.stdout.trim();
}

async function readManifest(packageRoot) {
    return JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
}

async function readRegistryPackage() {
    const response = await fetch(REGISTRY_URL, {
        headers: { accept: "application/json" },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}`);
    return response.json();
}

async function verifySource(packageRoot, releaseTag) {
    const manifest = await readManifest(packageRoot);
    const changelogText = await fs.readFile(path.join(packageRoot, "CHANGELOG.md"), "utf8");
    const errors = validateReleaseMetadata({ manifest, changelogText, releaseTag });
    const repoRoot = path.resolve(packageRoot, "../..");
    const status = runGit(repoRoot, ["status", "--porcelain", "--untracked-files=all"]);
    expect(errors, status === "", "release checkout must be clean");
    const head = runGit(repoRoot, ["rev-parse", "HEAD"]);
    let tagCommit = "";
    try {
        tagCommit = runGit(repoRoot, ["rev-parse", `refs/tags/${releaseTag}^{commit}`]);
    } catch {
        errors.push(`release tag ${releaseTag} does not exist`);
    }
    expect(errors, tagCommit === head, "release tag must point to the checked-out commit");
    const onMain = spawnSync("git", ["merge-base", "--is-ancestor", head, "origin/main"], { cwd: repoRoot });
    expect(errors, onMain.status === 0, "release commit must be reachable from origin/main");
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(`Verified release source ${releaseTag} at ${head}.`);
}

async function verifyRegistryBefore(packageRoot, authMode, bootstrapTokenPresent) {
    const manifest = await readManifest(packageRoot);
    const registryPackage = await readRegistryPackage();
    const packageExists = registryPackage !== null;
    const versionExists = Boolean(registryPackage?.versions?.[manifest.version]);
    const errors = validatePublishMode({ authMode, packageExists, versionExists, bootstrapTokenPresent });
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(`Verified npm preflight for ${manifest.name}@${manifest.version} using ${authMode}.`);
}

async function verifyRegistryAfter(packageRoot, artifactPath) {
    const manifest = await readManifest(packageRoot);
    const registryPackage = await readRegistryPackage();
    const registryVersion = registryPackage?.versions?.[manifest.version];
    const expectedIntegrity = artifactIntegrity(await fs.readFile(path.resolve(artifactPath)));
    const errors = validatePublishedMetadata({ manifest, registryVersion, expectedIntegrity });
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(`Verified published artifact ${manifest.name}@${manifest.version}: ${expectedIntegrity}.`);
}

async function main() {
    const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const command = process.argv[2];
    if (command === "source") {
        if (!process.env.DSH_PLUGIN_RELEASE_TAG) throw new Error("DSH_PLUGIN_RELEASE_TAG is required");
        await verifySource(packageRoot, process.env.DSH_PLUGIN_RELEASE_TAG);
        return;
    }
    if (command === "registry-before") {
        await verifyRegistryBefore(
            packageRoot,
            process.env.NPM_AUTH_MODE || "",
            process.env.NPM_BOOTSTRAP_TOKEN_PRESENT === "true",
        );
        return;
    }
    if (command === "registry-after") {
        if (!process.argv[3]) throw new Error("artifact path is required");
        await verifyRegistryAfter(packageRoot, process.argv[3]);
        return;
    }
    throw new Error("usage: verify-release.mjs <source|registry-before|registry-after> [artifact]");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : "release verification failed");
        process.exitCode = 1;
    });
}
