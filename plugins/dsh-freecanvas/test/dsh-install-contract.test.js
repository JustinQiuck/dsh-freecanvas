import assert from "node:assert/strict";
import test from "node:test";

import {
    assertBundleManifest,
    assertDisabledOfficialStatus,
    assertSingleFreeCanvasConfig,
    createLifecycleCommands,
} from "../scripts/verify-dsh-install.mjs";

const packageName = "dsh-plugin-freecanvas";
const configDump = `# == ${packageName}\n- id: ui-dsh-freecanvas\n  name: '${packageName}'\n`;

test("the composed config requires exactly one FreeCanvas entry", () => {
    assert.doesNotThrow(() => assertSingleFreeCanvasConfig(configDump, true));
    assert.doesNotThrow(() => assertSingleFreeCanvasConfig("# base web config\n", false));
    assert.throws(() => assertSingleFreeCanvasConfig("# base web config\n", true), /exactly once/);
    assert.throws(() => assertSingleFreeCanvasConfig(`${configDump}${configDump}`, true), /exactly once/);
});

test("the profile manifest requires exactly one FreeCanvas bundle", () => {
    const installed = { dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", packageName] } } };
    assert.doesNotThrow(() => assertBundleManifest(installed, true));
    assert.doesNotThrow(() => assertBundleManifest({ dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"] } } }, false));
    assert.throws(() => assertBundleManifest({ dsh: { profile: { bundles: [packageName, packageName] } } }, true), /exactly once/);
});

test("the clean-install status proves the official channel is disabled", () => {
    assert.doesNotThrow(() => assertDisabledOfficialStatus({
        enabled: false,
        connected: false,
        account_portal_url: "",
        token_expires_at: "",
    }));
    assert.throws(() => assertDisabledOfficialStatus({
        enabled: true,
        connected: false,
        account_portal_url: "",
        token_expires_at: "",
    }), /disabled/);
    assert.throws(() => assertDisabledOfficialStatus({ enabled: false, connected: false, access_token: "unexpected" }), /public fields/);
});

test("the lifecycle command plan installs and removes only the candidate package", () => {
    const tarball = "/tmp/dsh-plugin-freecanvas-0.2.0.tgz";
    assert.deepEqual(createLifecycleCommands({ tarball, profile: "web" }), {
        bootstrap: ["--profile", "web", "--dump-config"],
        install: ["plugin", "--profile", "web", "add", tarball],
        inspect: ["--profile", "web", "--dump-config"],
        remove: ["plugin", "--profile", "web", "remove", packageName],
    });
});
