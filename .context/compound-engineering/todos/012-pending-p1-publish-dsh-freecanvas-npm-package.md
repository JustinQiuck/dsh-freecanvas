---
status: pending
priority: p1
issue_id: "012"
tags: [npm, release, provenance, external]
dependencies: ["010", "011"]
---

# 发布 DSH FreeCanvas npm 包

## Problem Statement

`dsh-plugin-freecanvas` 当前在 npm registry 返回 404，市场无法通过稳定包名安装。

## Findings

- 包已经具有 npm 元数据和预构建资源路径。
- 发布需要 npm 所有权、受保护 GitHub Environment、版本/tag 一致性和最终人工批准。
- npm 发布是外部不可逆动作，不能在本地 gate 完成前执行。
- npm 要求 package 已存在后才能配置 Trusted Publisher；首次发布必须使用受保护的一次性 token，随后立即撤销并切换 OIDC。

## Proposed Solutions

### Option 1: 长期 npm Token 自动发布

**Approach:** 在 GitHub secret 保存 automation token。

**Pros:** 通用。

**Cons:** 长期凭据风险较高。

**Effort:** 低

**Risk:** 中

### Option 2: npm Trusted Publishing/OIDC

**Approach:** 绑定仓库 workflow 和受保护 Environment，发布 provenance 包。

**Pros:** 不保存长期 npm Token，审计与来源更清晰。

**Cons:** 需要 npm 所有者后台配置。

**Effort:** 中

**Risk:** 低

## Recommended Action

待 triage 时优先批准 Option 2；只有 Unit 1-3 全部完成且用户再次确认外部发布后执行。

## Technical Details

**Affected files:**
- `.github/workflows/publish-dsh-freecanvas.yml`
- `plugins/dsh-freecanvas/package.json`
- `plugins/dsh-freecanvas/CHANGELOG.md`

## Resources

- Plan: `docs/plans/2026-08-24-001-feat-dsh-marketplace-release-plan.md` Unit 4

## Acceptance Criteria

- [ ] npm Trusted Publisher/Environment 权限完成配置。
- [ ] 插件专用 tag、package 版本和插件 Changelog 一致，根项目 `VERSION` 保持独立。
- [ ] 发布前重复通过 package、host 和 clean-install gates。
- [ ] npm public 包带 provenance，可按精确版本安装。
- [ ] registry tarball integrity 与候选产物一致。
- [ ] 保留上一稳定版本和回滚说明。

## Work Log

### 2026-08-25 - Controlled workflow prepared

**By:** Codex

**Actions:**
- 增加插件专用 tag、干净 main、package/Changelog 一致性和 registry integrity 校验。
- 增加 `npm-production` Environment gate，区分仅用于首次发布的 bootstrap token 与后续 Trusted Publishing。
- 保持 tag、npm publish、Environment 配置和市场登记未执行，等待单独授权。

**Learnings:**
- 首发包不存在时无法预配 npm Trusted Publisher；首发后撤销临时凭据是必要的独立操作门。

### 2026-08-24 - Planned

**By:** Codex

**Actions:**
- 确认 npm 当前尚无该包。
- 选择 OIDC/provenance 作为推荐发布边界。

**Learnings:**
- 发布授权和包工程必须分开，外部动作继续等待显式确认。
