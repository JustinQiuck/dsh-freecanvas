---
status: pending
priority: p1
issue_id: "008"
tags: [deployment, billing, security, commercial-gate]
dependencies: ["001", "002", "003", "004", "005", "006", "007"]
---

# 验证并审批开启付费官方渠道

## Problem Statement

代码实现和本地测试不能证明渠道可向付费用户开放。生产 HTTPS、真实 KIE 账号、卡密入账、扣点、失败退款、日志脱敏、商业授权和售后规则都需要独立证据与激活审批。

## Findings

- 当前 KIE 图片/视频已完成内部连通性测试，但失败退款、正式售价、商业授权和生产暴露仍是阻断项。
- 测试服务器此前按 localhost-only 方式部署，不能直接视为生产公网服务。
- 主计划明确要求 `officialChannelEnabled` 默认关闭，激活必须独立确认。

## Proposed Solutions

### Option 1: 分层验收后单独激活（采用）

**Approach:** 依次完成代码、本地、服务器、商业四层证据，最后由用户明确批准开启。

**Pros:** 状态边界清楚；可安全回滚；避免把内部测试误当生产就绪。

**Cons:** 需要真实账户、供应商确认和人工验收。

**Effort:** 1-3 天，不含商业授权等待时间

**Risk:** High

### Option 2: 合并后立即默认开启

**Approach:** 使用现有测试价格和服务器直接向用户开放。

**Pros:** 上线快。

**Cons:** 可能泄密、重复扣费、亏损或违反供应商条款。

**Effort:** 0.5 天

**Risk:** Critical

## Recommended Action

采用 Option 1。本 TODO 保持 `pending`，直到所有依赖完成且用户为服务器部署、真实扣费测试和最终激活分别授权。

## Technical Details

**Affected files after implementation:**
- `CHANGELOG.md`
- `docs/content/docs/progress/todo.mdx`
- `docs/content/docs/progress/pending-test.mdx`
- `plugins/dsh-freecanvas/README.md`
- `docs/plans/2026-08-21-001-feat-kie-new-api-channel-plan.md`
- `docs/content/docs/overview/features.mdx`（仅用户确认通过后）
- New API `docs/freecanvas-operations.md`

**External state:**
- New API 生产 HTTPS 部署
- KIE 真实账号与商业授权
- 卡密批次和购买页
- 正式模型价格、毛利和低余额告警

## Resources

- Master plan Unit 7 and live acceptance order: `docs/plans/2026-08-23-001-feat-official-channel-redemption-plan.md`
- Existing KIE plan evidence: `docs/plans/2026-08-21-001-feat-kie-new-api-channel-plan.md`

## Acceptance Criteria

- [ ] 依赖 TODO `001`-`007` 全部为 `complete`。
- [ ] 生产 New API 使用 HTTPS，KIE Key 仅保存在服务端。
- [ ] 使用一次性内测用户完成配对成功、重放失败和过期失败。
- [ ] 浏览器网络、配置导出、WebDAV、支持包和日志中没有设备 Token、配对码、卡密或 KIE Key。
- [ ] 低面值卡密只入账一次，响应丢失/重试后可通过最新余额恢复认知。
- [ ] `gpt-image-2` 文生图和图生图成功，扣点与 Quota 一致。
- [ ] `grok-imagine-video` 创建、轮询、下载成功，终态扣点一致。
- [ ] 余额不足在请求到达 KIE 前拒绝。
- [ ] 可控上游失败只退款一次，重复查询不重复退款。
- [ ] DSH 重启后凭据权限和可用性正确；断开后本地/远端均不可再调用。
- [ ] 正式售价、卡密面值、毛利、低余额告警和急停阈值已批准。
- [ ] KIE 转售/白标/代充商业授权有明确条款或书面证据。
- [ ] 用户隐私披露、内容责任、卡密售后和退款规则已发布。
- [ ] 测试 Token、临时卡密、临时用户和本地文件已安全清理。
- [ ] 实现变更先写入 `pending-test.mdx` 和 Changelog。
- [ ] 用户确认测试通过后才更新正式 features 文档。
- [ ] 用户单独明确批准把 `officialChannelEnabled` 切换为 `true`。
- [ ] 激活后完成一次只读健康/余额检查，并保留脱敏证据和回滚方式。

## Work Log

### 2026-08-23 - Todo 创建

**By:** Codex

**Actions:**
- 将部署验证、真实扣费、商业授权与最终激活从代码实现中分离。

**Learnings:**
- “已实现”“已部署”“已配置”“已向付费用户开放”是四个不同状态。

## Notes

- 本 TODO 当前为 `pending`，不代表已经授权访问服务器、真实扣费或商业激活。
- 激活失败时先把 `officialChannelEnabled` 恢复为 `false`，再调查原因；自定义 BYOK 渠道不受影响。
