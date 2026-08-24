---
status: ready
priority: p1
issue_id: "011"
tags: [dsh, desktop, acceptance, release]
dependencies: ["010"]
---

# 验证 Desktop 插件完整生命周期

## Problem Statement

CI 不能证明 DSH Desktop 侧边栏、分屏布局、Renderer 冷启动、Canvas Agent 自动连接和卸载后的真实用户体验。

## Findings

- 之前已经修复过重启后画布不启动、插件持续加载和 MCP `fetch failed`。
- 当前这些行为记录在 `pending-test`，还需要使用最终候选 tarball 重新验收。

## Proposed Solutions

### Option 1: 直接覆盖日常 Desktop profile

**Approach:** 在用户当前 profile 安装候选包。

**Pros:** 快。

**Cons:** 失败会影响用户现有环境，卸载边界不清晰。

**Effort:** 低

**Risk:** 高

### Option 2: 隔离 Desktop profile 验收后再升级日常环境

**Approach:** 用候选 tarball 在隔离 profile 完成生命周期测试，保留脱敏证据。

**Pros:** 风险低，证据可复核。

**Cons:** 多一次 profile 准备。

**Effort:** 中

**Risk:** 低

## Recommended Action

实施 Option 2；完整重启、安装、升级、布局、Agent/MCP、卸载全部通过后再接受市场发布。

## Technical Details

**Affected files:**
- `docs/content/docs/progress/pending-test.mdx`
- `docs/content/docs/progress/pending-test.zh-CN.mdx`
- 测试通过后更新正式 features 文档

## Resources

- Plan: `docs/plans/2026-08-24-001-feat-dsh-marketplace-release-plan.md` Unit 3

## Acceptance Criteria

- [ ] 候选 tarball 在隔离 Desktop profile 安装成功。
- [ ] 完整重启后不再停留在 Loading plugins，侧边栏入口唯一。
- [ ] 会话/分屏/画布切换和布局恢复正常。
- [ ] Canvas Agent 自动启动，健康检查和一次只读 MCP 调用成功。
- [ ] 升级保留本地画布与布局，卸载不影响其他插件。
- [ ] 官方渠道保持关闭，网络和日志无敏感凭据。

## Work Log

### 2026-08-24 - Planned

**By:** Codex

**Actions:**
- 将真实 Desktop 验收列为 npm 发布前阻断项。

**Learnings:**
- 历史冷启动故障要求每个最终候选 tarball 都重新验证完整重启。
