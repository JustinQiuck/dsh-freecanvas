import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
    artifactIntegrity,
    validatePublishedMetadata,
    validatePublishMode,
    validateReleaseMetadata,
} from "../scripts/verify-release.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = {
    name: "dsh-plugin-freecanvas",
    version: "0.2.0",
    repository: { url: "git+https://github.com/JustinQiuck/dsh-freecanvas.git" },
};
const cleanChangelog = "# Changelog\n\n## Unreleased\n\n## 0.2.0\n\n- Ready.\n";

test("matching tag, package version, and released changelog pass", () => {
    assert.deepEqual(validateReleaseMetadata({
        manifest,
        changelogText: cleanChangelog,
        releaseTag: "dsh-plugin-freecanvas@0.2.0",
    }), []);
});

test("release metadata fails closed on drift or unreleased entries", () => {
    const cases = [
        { manifest: { ...manifest, name: "other-package" }, changelogText: cleanChangelog, releaseTag: "dsh-plugin-freecanvas@0.2.0" },
        { manifest, changelogText: cleanChangelog, releaseTag: "v0.2.0" },
        { manifest, changelogText: cleanChangelog.replace("## 0.2.0", "## 0.2.1"), releaseTag: "dsh-plugin-freecanvas@0.2.0" },
        { manifest, changelogText: cleanChangelog.replace("## Unreleased\n", "## Unreleased\n\n- Not released.\n"), releaseTag: "dsh-plugin-freecanvas@0.2.0" },
    ];
    for (const candidate of cases) assert.ok(validateReleaseMetadata(candidate).length > 0);
});

test("bootstrap token is accepted only for the first publication", () => {
    assert.deepEqual(validatePublishMode({
        authMode: "bootstrap-token",
        packageExists: false,
        versionExists: false,
        bootstrapTokenPresent: true,
    }), []);
    assert.ok(validatePublishMode({ authMode: "bootstrap-token", packageExists: false, versionExists: false, bootstrapTokenPresent: false }).length > 0);
    assert.ok(validatePublishMode({ authMode: "bootstrap-token", packageExists: true, versionExists: false, bootstrapTokenPresent: true }).length > 0);
});

test("trusted publishing requires an existing package and no bootstrap token", () => {
    assert.deepEqual(validatePublishMode({
        authMode: "trusted-publisher",
        packageExists: true,
        versionExists: false,
        bootstrapTokenPresent: false,
    }), []);
    assert.ok(validatePublishMode({ authMode: "trusted-publisher", packageExists: false, versionExists: false, bootstrapTokenPresent: false }).length > 0);
    assert.ok(validatePublishMode({ authMode: "trusted-publisher", packageExists: true, versionExists: false, bootstrapTokenPresent: true }).length > 0);
    assert.ok(validatePublishMode({ authMode: "trusted-publisher", packageExists: true, versionExists: true, bootstrapTokenPresent: false }).length > 0);
});

test("published metadata must retain the exact candidate integrity", () => {
    const expectedIntegrity = artifactIntegrity(Buffer.from("candidate"));
    const registryVersion = {
        ...manifest,
        dist: {
            integrity: expectedIntegrity,
            tarball: "https://registry.npmjs.org/dsh-plugin-freecanvas/-/dsh-plugin-freecanvas-0.2.0.tgz",
            attestations: {
                url: "https://registry.npmjs.org/-/npm/v1/attestations/dsh-plugin-freecanvas@0.2.0",
                provenance: { predicateType: "https://slsa.dev/provenance/v1" },
            },
        },
    };
    assert.deepEqual(validatePublishedMetadata({ manifest, registryVersion, expectedIntegrity }), []);
    assert.ok(validatePublishedMetadata({ manifest, registryVersion, expectedIntegrity: artifactIntegrity(Buffer.from("other")) }).length > 0);
    assert.ok(validatePublishedMetadata({ manifest, registryVersion: { ...registryVersion, dist: { ...registryVersion.dist, attestations: undefined } }, expectedIntegrity }).length > 0);
});

test("the current package metadata is ready for its dedicated release tag", async () => {
    const currentManifest = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"));
    const changelogText = await fs.readFile(path.join(packageRoot, "CHANGELOG.md"), "utf8");
    assert.deepEqual(validateReleaseMetadata({
        manifest: currentManifest,
        changelogText,
        releaseTag: `${currentManifest.name}@${currentManifest.version}`,
    }), []);
});
