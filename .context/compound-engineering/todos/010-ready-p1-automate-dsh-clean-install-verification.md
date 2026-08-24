---
status: ready
priority: p1
issue_id: "010"
tags: [dsh, ci, integration, packaging]
dependencies: ["009"]
---

# 自动验证 DSH 干净安装生命周期

## Problem Statement

包文件完整不等于 DSH 能从 tarball 正确安装、组成配置、启动和卸载；目前没有隔离 profile 的自动证据。

## Findings

- DSH 官方支持把预构建 tarball/npm 包加入 profile。
- `pending-test` 已要求验证唯一 entry、内置 Web、Agent 启动和卸载不影响其他插件。
- 规划时官方 npm CLI 版本为 `@deepseek-ai/dsh@0.1.1-rc.2`。

## Proposed Solutions

### Option 1: 只做 Desktop 人工测试

**Approach:** 每次发布前手工安装。

**Pros:** 接近最终环境。

**Cons:** 慢且不可重复，难以定位 manifest/CLI 回归。

**Effort:** 低

**Risk:** 中

### Option 2: CI 临时 profile + Desktop 终验

**Approach:** CI 自动完成 pack/install/dump/boot/remove，Desktop 只承担界面和冷启动终验。

**Pros:** 快速阻断结构回归，同时保留真实环境证据。

**Cons:** 需要可靠管理临时进程和超时。

**Effort:** 中

**Risk:** 低

## Recommended Action

实施 Option 2；所有自动检查使用临时 `DSH_HOME`，固定 DSH 基线并把 latest 兼容探测设为非阻断报告。

## Technical Details

**Affected files:**
- `plugins/dsh-freecanvas/scripts/verify-dsh-install.mjs`
- `plugins/dsh-freecanvas/test/dsh-install-contract.test.js`
- `.github/workflows/dsh-freecanvas-package.yml`
- `plugins/dsh-freecanvas/package.json`

## Resources

- Plan: `docs/plans/2026-08-24-001-feat-dsh-marketplace-release-plan.md` Unit 2
- DSH CLI reference: `https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md`

## Acceptance Criteria

- [ ] CI 从候选 tarball 安装到一次性 profile。
- [x] profile bundles 和 dump config 中 FreeCanvas 恰好出现一次。
- [x] DSH Web 启动后画布首页、静态资源和关闭状态接口可访问。
- [x] 重复安装/升级不产生重复 entry。
- [x] 卸载后 FreeCanvas 消失，基础 profile 仍可组成并启动。
- [x] 测试可靠清理子进程和临时目录，不访问 KIE。

## Work Log

### 2026-08-24 - Planned

**By:** Codex

**Actions:**
- 确认官方 DSH profile、tarball 和 dump-config 契约。
- 将自动集成检查与真实 Desktop 验收分层。

**Learnings:**
- dump config 能证明配置组成，但仍需要一次真实 Web 启动证明 client/route 激活。

### 2026-08-24 - Implementation prepared

**By:** Codex

**Actions:**
- 新增候选 tarball 的临时 `DSH_HOME` 安装、重复安装、Web 启动、官方渠道关闭状态、卸载和基础 Web 重启检查。
- 新增固定 Node 24、pnpm 10 与 `@deepseek-ai/dsh@0.1.1-rc.2` 的 package lifecycle workflow。
- 本地契约测试 9/9 通过，发布包静态验证通过并确认 27 个候选文件。

**Learnings:**
- 自动验收必须关闭 Canvas Agent，才能保证 CI 不接触用户级 `~/.infinite-canvas`；真实 Agent 冷启动属于后续 Desktop 验收。
- 首次真实验收发现卸载前不能把 profile patch 写成空文件；保存并原样恢复 DSH 自动生成的基线 patch 后，`@deepseek-ai/dsh@0.1.1-rc.2` 的完整本机生命周期已通过。
- GitHub clean runner 尚未实际执行新增 workflow，因此保持本 TODO 为 `ready`，不提前标记完成。
