---
status: ready
priority: p1
issue_id: "003"
tags: [new-api, billing, quota, redemption]
dependencies: ["002"]
---

# 增加 New API 点数与卡密兑换接口

## Problem Statement

FreeCanvas 需要安全显示余额、兑换卡密和撤销当前设备，但不能创建第二套账本，也不能让普通 Token 调用专用钱包接口。

## Findings

- New API `User.Quota`、`QuotaPerUnit` 和现有 billing session 已是权威扣费/退款链路。
- `model/redemption.go` 已支持事务兑换和并发单次成功，应复用而非重写。
- `controller/user.go` 当前 TopUp 错误日志可能写入完整 `req.Key`，商业开放前必须脱敏。
- 点数只是展示单位：`points = User.Quota / QuotaPerUnit × 1000`。

## Proposed Solutions

### Option 1: Quota 单账本 + 窄专用接口（采用）

**Approach:** 服务端使用 decimal 换算字符串，专用端点仅接受 `freecanvas_device` Token，并复用 `model.Redeem`。

**Pros:** 无账本漂移；沿用已有并发和退款能力；审计边界清楚。

**Cons:** 需要为账户、兑换和撤销补充控制器与测试。

**Effort:** 1-2 天

**Risk:** Medium

### Option 2: 在 FreeCanvas 建独立 points 表

**Approach:** 卡密兑换后同步一份插件点数。

**Pros:** 前端概念直接。

**Cons:** 双账本、退款漂移、同步失败和审计复杂度不可接受。

**Effort:** 2-4 天

**Risk:** High

## Recommended Action

采用 Option 1。New API Quota 保持唯一账本；所有 points 字段由服务端 decimal 换算为字符串，卡密兑换和 Token 撤销复用现有事务/缓存失效机制。

## Technical Details

**Affected files in New API:**
- `controller/freecanvas.go`
- `controller/freecanvas_test.go`
- `service/freecanvas_points.go`（新增）
- `service/freecanvas_points_test.go`（新增）
- `controller/user.go`
- `router/api-router.go`
- `model/redemption.go`（验证复用）
- `model/redemption_test.go`（验证/补充）

**Endpoints:**
- `GET /api/freecanvas/account`
- `POST /api/freecanvas/redeem`
- `DELETE /api/freecanvas/device`

## Resources

- Master plan Unit 2: `docs/plans/2026-08-23-001-feat-official-channel-redemption-plan.md`
- Existing redemption: New API `model/redemption.go`
- Existing quota: New API `service/quota.go`

## Acceptance Criteria

- [ ] 三个端点只接受 `TokenAuth + Purpose=freecanvas_device`。
- [ ] `/account` 返回 decimal string 的 `points`、`used_points`、比例和 Token 过期时间。
- [ ] `/account` 不返回 raw API Token、KIE credits、渠道 Key 或不必要个人信息。
- [ ] `TopUpLink` 只有通过 HTTPS URL 校验才返回。
- [ ] `/redeem` 复用现有 Payment Compliance、用户锁和 `model.Redeem`。
- [ ] 有效卡密只增加一次 Quota，并返回 `added_points` 与最新 `points`。
- [ ] 重复、禁用、过期或无效卡密使用统一安全错误。
- [ ] `controller/user.go` 和新端点日志均不再记录完整卡密。
- [ ] 并发兑换同一卡密只有一次成功，余额与数据库一致。
- [ ] `QuotaPerUnit<=0`、零余额、大余额和非整数点数都有确定测试。
- [ ] `/device` 只撤销当前 Token ID，并立即失效数据库/Redis cache。
- [ ] 重复撤销保持幂等，不能影响其他设备或用户 Token。
- [ ] 验收者已运行主计划列出的 model/service/controller targeted tests 并记录结果。

## Work Log

### 2026-08-23 - 实现待验证

**By:** Codex

**Actions:**
- 在 `codex/kie-official-channel` 的隔离 New API 工作区新增 `/api/freecanvas/account`、`/redeem`、`/device`；路由以 `TokenAuth + Purpose=freecanvas_device`、`no-store` 和兑换请求 1KB 上限保护。
- `service/freecanvas_points.go` 是唯一 `User.Quota`/`UsedQuota` 到 decimal points 字符串的换算入口；`TopUpLink` 仅在无凭据、无查询/片段的绝对 HTTPS 地址时返回。
- 卡密路径复用 `model.Redeem`、既有用户锁和 Payment Compliance 守卫；通用兑换失败日志已移除完整卡密。当前设备撤销使用专用 model helper，调用 `Token.Delete()` 立即触发数据库软删与 Redis cache invalidation，重复 model 调用安全且不影响其他设备。
- 已补充 service、controller、model 测试覆盖；本地定向测试已通过，未推送、未部署，官方渠道保持关闭。

**Remaining:**
- 在备份后的 New API 测试环境运行 points、redemption、controller、Redis 和撤销回归验证，再决定是否把 `002`/`003` 标记完成。

### 2026-08-23 - 定向回归通过

**By:** Codex

**Evidence:**
- `go test ./service ./model ./controller -run '^(TestFreeCanvas|TestExchangeFreeCanvas|TestRevokeFreeCanvas|TestCreateFreeCanvas|TestDeleteFreeCanvas)'`：账户、兑换、撤销、点数换算和 Redis 失效覆盖均通过。
- 全包 `go test ./service ./model ./controller` 仍被既有 `TestTokenCacheInitPreservesLiveQuotaAndFenceBlocksStaleSnapshot` 阻断；该失败不在本轮文件范围，未宣称为通过。

### 2026-08-23 - Todo 创建

**By:** Codex

**Actions:**
- 将余额展示、兑换幂等、日志脱敏和设备撤销归入同一账本边界。

**Learnings:**
- KIE `creditsConsumed` 是供应商成本，不能成为用户 points 账本。

## Notes

- 不新增支付订单、订阅或第二套积分表。
