---
status: complete
priority: p1
issue_id: "009"
tags: [dsh, npm, packaging, release]
dependencies: []
---

# 加固 DSH 插件发布包契约

## Problem Statement

当前 `npm pack --dry-run` 可以列出候选包，但缺少自动契约检查，无法在入口、内置 Web、bundle patch、许可证或敏感信息边界漂移时阻止发布。

## Findings

- `plugins/dsh-freecanvas/package.json` 已有 `prepack`、`files`、`dsh.bundle` 和 client manifest。
- 宿主测试已经覆盖运行逻辑，但没有覆盖 npm tarball 的完整性。
- 正式 npm 包仍未发布，当前适合先建立 fail-closed 发布检查。

## Proposed Solutions

### Option 1: 只保留人工检查

**Approach:** 每次发布人工阅读 pack 输出。

**Pros:** 改动最少。

**Cons:** 容易漏项，无法成为 CI gate。

**Effort:** 低

**Risk:** 高

### Option 2: 增加可测试的包契约校验器

**Approach:** 校验 manifest、patch、dry-run file list、许可证和明确凭据模式，并加入 Node 原生测试。

**Pros:** 可重复、可诊断、可接入 CI。

**Cons:** 需要维护少量明确 allowlist。

**Effort:** 中

**Risk:** 低

## Recommended Action

实施 Option 2；保持校验器短小，只覆盖市场发布的硬性契约，不扩展成通用安全扫描器。

## Technical Details

**Affected files:**
- `plugins/dsh-freecanvas/package.json`
- `plugins/dsh-freecanvas/CHANGELOG.md`
- `plugins/dsh-freecanvas/scripts/verify-package.mjs`
- `plugins/dsh-freecanvas/test/package-release.test.js`
- `plugins/dsh-freecanvas/README.md`
- `CHANGELOG.md`

## Resources

- Plan: `docs/plans/2026-08-24-001-feat-dsh-marketplace-release-plan.md` Unit 1
- DSH publish guide: `https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md`

## Acceptance Criteria

- [x] 当前合法 manifest、patch 和 pack file list 通过。
- [x] 缺少宿主/客户端入口、bundle patch、Web 首页或许可证时明确失败。
- [x] 包名、patch entry 名称和发布版本边界不一致时失败。
- [x] 插件使用独立 Changelog 和 `dsh-plugin-freecanvas@<version>` tag 约定，不改根项目 `VERSION`。
- [x] 明确凭据模式进入候选文本文件时失败，错误信息不回显完整秘密。
- [x] `verify:package` 不发布包、不写 registry，也不生成遗留 `.tgz`。
- [x] README、pending-test 和 Changelog 与实际检查一致。

## Work Log

### 2026-08-24 - Planned

**By:** Codex

**Actions:**
- 完成当前包结构、host tests 和 dry-run pack 证据审查。
- 选择可测试的 fail-closed 包契约方案。

**Learnings:**
- 当前包结构基本完整，但 dry-run 输出尚未成为自动发布门槛。

### 2026-08-24 - Completed

**By:** Codex

**Actions:**
- 新增可测试的 manifest、bundle patch、pack file-list 和敏感字面量校验器。
- 增加 npm public 元数据、DSH `0.1.1` settings 兼容线和独立插件 Changelog。
- 运行完整宿主测试 22/22，并确认 dry-run 候选包包含 26 个文件且未生成 `.tgz`。

**Learnings:**
- 插件版本和根项目版本需要独立管理；插件使用 `dsh-plugin-freecanvas@<version>` tag，不能复用根项目 `v*` tag。
