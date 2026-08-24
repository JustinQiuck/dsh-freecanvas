import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
    findSensitiveLiterals,
    inspectReleaseCandidate,
    validateReleaseContract,
} from "../scripts/verify-package.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchText = "- insert:\n    - id: ui-dsh-freecanvas\n      name: 'dsh-plugin-freecanvas'\n";
const manifest = {
    name: "dsh-plugin-freecanvas",
    version: "0.2.0",
    license: "Elastic-2.0",
    type: "module",
    main: "./lib/index.js",
    scripts: {
        "test:host": "node --test ./test/*.test.js",
        "verify:package": "node ./scripts/verify-package.mjs",
        prepack: "npm run build:web",
    },
    repository: {
        type: "git",
        url: "git+https://github.com/JustinQiuck/dsh-freecanvas.git",
        directory: "plugins/dsh-freecanvas",
    },
    homepage: "https://github.com/JustinQiuck/dsh-freecanvas/tree/main/plugins/dsh-freecanvas#readme",
    bugs: { url: "https://github.com/JustinQiuck/dsh-freecanvas/issues" },
    exports: {
        ".": "./lib/index.js",
        "./client": "./lib/client.js",
        "./package.json": "./package.json",
    },
    files: ["lib", "scripts", "web", "cordis.patch.yml", "README.md", "CHANGELOG.md", "LICENSE", "LICENSING.md", "THIRD_PARTY_NOTICES.md"],
    publishConfig: { access: "public" },
    engines: { node: "^22.19.0 || >=24.0.0" },
    dependencies: { "@basketikun/canvas-agent": "0.6.0" },
    devDependencies: {
        "@deepseek-ai/cordis": "4.0.1",
        "@deepseek-ai/dsh-settings": "0.1.1-rc.2",
        "@deepseek-ai/schemastery": "3.18.1",
    },
    peerDependencies: {
        "@deepseek-ai/dsh-settings": "^0.1.0-rc.7 || ^0.1.1-rc.1",
        "@deepseek-ai/schemastery": "^3.18.1",
    },
    dsh: {
        bundle: { patch: "./cordis.patch.yml" },
        client: { platform: "web" },
    },
};
const packedFiles = [
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
    "web/assets/index.js",
    "web/assets/index.css",
    "web/config.js",
    "web/index.html",
];

test("a complete DSH release contract passes", () => {
    assert.deepEqual(validateReleaseContract({ manifest, patchText, packedFiles }), []);
});

test("manifest and patch drift fail closed", () => {
    const cases = [
        ["bundle patch", { ...manifest, dsh: { ...manifest.dsh, bundle: {} } }],
        ["client platform", { ...manifest, dsh: { ...manifest.dsh, client: {} } }],
        ["host export", { ...manifest, exports: { ...manifest.exports, ".": "./lib/missing.js" } }],
        ["public access", { ...manifest, publishConfig: {} }],
        ["DSH settings compatibility", { ...manifest, peerDependencies: { ...manifest.peerDependencies, "@deepseek-ai/dsh-settings": "^0.1.0-rc.7" } }],
    ];
    for (const [label, invalidManifest] of cases) {
        assert.ok(validateReleaseContract({ manifest: invalidManifest, patchText, packedFiles }).length > 0, label);
    }
    assert.ok(validateReleaseContract({ manifest, patchText: patchText.replace("dsh-plugin-freecanvas", "other-package"), packedFiles }).length > 0);
});

test("every required release file is enforced", () => {
    for (const file of packedFiles) {
        const errors = validateReleaseContract({ manifest, patchText, packedFiles: packedFiles.filter((candidate) => candidate !== file) });
        assert.ok(errors.length > 0, file);
    }
});

test("sensitive literal findings cover release credentials without echoing them", () => {
    const cases = [
        [`sk-${"a".repeat(48)}`, "OpenAI-style credential", (secret) => `const credential = "${secret}";`],
        ["b".repeat(48), "literal bearer credential", (secret) => `authorization: "Bearer ${secret}"`],
        ["c".repeat(48), "assigned KIE credential", (secret) => `KIE_API_KEY = "${secret}"`],
        ["d".repeat(32), "literal pairing or card credential", (secret) => `card_code: "${secret}"`],
    ];
    for (const [credential, kind, source] of cases) {
        const findings = findSensitiveLiterals("fixture.js", source(credential));
        assert.deepEqual(findings, [{ file: "fixture.js", kind }]);
        assert.equal(JSON.stringify(findings).includes(credential), false);
    }
    assert.deepEqual(findSensitiveLiterals("safe.js", "authorization: `Bearer ${token}`; KIE_API_KEY = process.env.KIE_API_KEY;"), []);
});

test("the current dry-run package satisfies the release contract", async () => {
    const before = (await fs.readdir(packageRoot)).filter((file) => file.endsWith(".tgz"));
    const result = await inspectReleaseCandidate(packageRoot);
    const after = (await fs.readdir(packageRoot)).filter((file) => file.endsWith(".tgz"));
    assert.deepEqual(result.errors, []);
    assert.equal(result.packedFiles.includes("web/index.html"), true);
    assert.deepEqual(after, before);
});
