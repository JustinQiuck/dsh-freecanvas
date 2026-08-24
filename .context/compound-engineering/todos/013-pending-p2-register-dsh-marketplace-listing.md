---
status: pending
priority: p2
issue_id: "013"
tags: [dsh, marketplace, documentation, external]
dependencies: ["012"]
---

# 登记 DSH 插件市场并复验

## Problem Statement

npm 可安装只是分发基础；普通用户还需要在当前 DSH 插件市场发现插件并获得一致的名称、版本、许可证和安装入口。

## Findings

- 文档已经把 DSH 插件市场作为普通用户入口。
- 当前实际 market catalog/提交入口需要在 npm 包发布后通过 Desktop 最新市场确认。
- 市场文案不能把默认关闭的 KIE 商业渠道描述为已开放。

## Proposed Solutions

### Option 1: 仅提供 npm 安装命令

**Approach:** 不登记市场。

**Pros:** 无外部审核依赖。

**Cons:** 不满足用户要求的市场发现路径。

**Effort:** 低

**Risk:** 中

### Option 2: npm 发布后登记当前 DSH catalog

**Approach:** 使用精确 npm spec、仓库所有权和已验收元数据提交市场。

**Pros:** 普通用户可发现并安装，符合产品入口。

**Cons:** 依赖市场维护方审核。

**Effort:** 中

**Risk:** 低

## Recommended Action

待 npm 包可公开安装后批准 Option 2；提交前再次确认当前市场的官方或社区治理边界。

## Technical Details

**Affected files:**
- `README.md`
- `plugins/dsh-freecanvas/README.md`
- `docs/content/docs/overview/quick-start.mdx`
- `docs/content/docs/overview/quick-start.zh-CN.mdx`
- `docs/content/docs/overview/dsh-plugin.mdx`
- `docs/content/docs/overview/dsh-plugin.zh-CN.mdx`

## Resources

- Plan: `docs/plans/2026-08-24-001-feat-dsh-marketplace-release-plan.md` Unit 5

## Acceptance Criteria

- [ ] 当前 DSH 市场 submission/catalog 入口已确认。
- [ ] 市场记录指向已发布 npm 精确版本和正确仓库。
- [ ] 名称、简介、许可证、图标和安装 spec 与仓库一致。
- [ ] 市场不宣传尚未开放的 KIE 付费能力。
- [ ] 无源码 checkout 环境完成搜索、安装、启动、升级和卸载。
- [ ] 发布记录保留版本、Git SHA、tarball SHA256 和回滚版本。

## Work Log

### 2026-08-24 - Planned

**By:** Codex

**Actions:**
- 将市场登记与 npm 发布拆成独立外部动作。

**Learnings:**
- 市场治理入口可能变化，必须在提交时以 Desktop 当前实现为准。
