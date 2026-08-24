---
status: complete
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

- [x] 候选 tarball 在隔离 Desktop profile 安装成功。
- [x] 完整重启后不再停留在 Loading plugins，侧边栏入口唯一。
- [x] 会话/分屏/画布切换和布局恢复正常。
- [x] Canvas Agent 自动启动，健康检查和一次只读 MCP 调用成功。
- [x] 升级保留本地画布与布局，卸载不影响其他插件。
- [x] 官方渠道保持关闭，网络和日志无敏感凭据。

## Work Log

### 2026-08-24 - Planned

**By:** Codex

**Actions:**
- 将真实 Desktop 验收列为 npm 发布前阻断项。

**Learnings:**
- 历史冷启动故障要求每个最终候选 tarball 都重新验证完整重启。

### 2026-08-24 - Completed

**By:** Codex

**Actions:**
- 在 DSH Desktop `2.0.1`、内置 DSH `0.1.0-rc.7` 的隔离 profile 中安装候选包，验证首次启动、完整冷启动、唯一侧边栏入口和会话/分屏/画布布局恢复。
- 验证包内 Canvas Agent 自动启动、健康检查可用、MCP 清单包含 34 个工具，并成功执行 `canvas_list_projects` 只读调用。
- 创建真实画布后发现 Desktop 动态端口改变会使浏览器 origin 变化，导致原 `localForage` 数据在同版本重装后不可见；新增宿主持久化接口与前端适配层后重新构建候选包。
- 最终候选包 SHA256 为 `2e3ff2db70e99584674930d1e36151ed29007b64cb8660266f568a0fa60e649f`；最终包跨冷启动新端口保留非空画布和无敏感占位渠道配置，修复候选序列另行验证同版本重装保留。画布和配置仍可见，宿主目录/数据文件权限分别为 `0700`/`0600`，当前端口浏览器控制台无警告或错误。
- 删除测试画布并卸载候选包，确认 FreeCanvas 入口及子进程消失、插件市场保留，随后恢复日常 `desktop` profile。
- 官方渠道全程保持关闭；脱敏日志检查未发现 KIE 地址、Bearer 凭据、设备 Token 或官方账户文件。

**Learnings:**
- 仅验证空画布和布局不足以证明 Desktop 升级安全；必须创建非空业务数据并跨完整重启、变化的本地 origin 和同版本重装复验。
- DSH 插件内的业务数据不能依赖随机本地端口对应的浏览器 origin，需由稳定的宿主私有存储承接，同时保留独立 Web 开发模式的浏览器本地回退。
