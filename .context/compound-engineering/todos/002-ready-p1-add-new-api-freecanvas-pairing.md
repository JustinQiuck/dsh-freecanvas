---
status: ready
priority: p1
issue_id: "002"
tags: [new-api, authentication, pairing, token]
dependencies: ["001"]
---

# 为 New API 增加 FreeCanvas 一次性配对

## Problem Statement

FreeCanvas 不能保存用户密码、New API 浏览器会话或用户手工复制的长期 Token。需要使用一次性配对码换取模型受限的设备 Token，并让普通 Token 无法冒充官方设备。

## Findings

- New API `model/auth_flow.go` 已有随机 token、HMAC 持久化、用途绑定、过期和原子消费能力。
- `model.Token` 已支持模型白名单和过期时间，但没有不可伪造的用途字段。
- Redis token cache 与数据库认证必须同时携带新 purpose，否则会产生缓存权限漂移。
- 目标基线为 `JustinQiuck/new-api@a867f99902366d4741ad63416e6f7b4ddf96ad75`。

## Proposed Solutions

### Option 1: AuthFlow + Token.Purpose（采用）

**Approach:** 增加 `freecanvas_pair` AuthFlow purpose 和 `freecanvas_device` Token purpose，在一次事务中消费配对码并创建 30 天模型受限 Token。

**Pros:** 复用成熟的一次性流程；最小权限；可撤销和过期；普通 Token 无法冒充。

**Cons:** 需要 Token schema 与 Redis cache 同步更新。

**Effort:** 1-2 天

**Risk:** Medium

### Option 2: 用户复制普通长期 API Token

**Approach:** 沿用 Token 管理页，让用户把 Token 粘贴到 FreeCanvas。

**Pros:** 后端改动少。

**Cons:** 长期凭据经过浏览器并易误存；权限边界和撤销体验差。

**Effort:** 0.5 天

**Risk:** High

## Recommended Action

采用 Option 1。配对码 5 分钟有效、一次性使用；设备 Token 固定 30 天、固定两个模型、固定 `Purpose=freecanvas_device`，普通用户 API 不得写入 Purpose。

## Technical Details

**Affected files in New API:**
- `model/auth_flow.go`
- `model/token.go`
- `model/token_cache.go`
- `model/freecanvas_pairing.go`（新增）
- `model/freecanvas_pairing_test.go`（新增）
- `controller/freecanvas.go`（新增）
- `controller/freecanvas_test.go`（新增）
- `middleware/auth.go`
- `router/api-router.go`
- `middleware/rate-limit.go`（仅在现有限流无法复用时）

**Database changes:**
- `Token.Purpose` 新列，`json:"-"`，旧 Token 默认为空。
- 使用现有 GORM AutoMigrate；部署前备份并验证 SQLite/MySQL/PostgreSQL。

## Resources

- Master plan Unit 1: `docs/plans/2026-08-23-001-feat-official-channel-redemption-plan.md`
- Existing pattern: New API `model/auth_flow.go`
- Existing pattern: New API `middleware/auth.go`

## Acceptance Criteria

- [ ] `POST /api/user/freecanvas/pair` 只接受真实浏览器用户会话。
- [ ] 配对码使用 256-bit 随机值，服务端仅持久化 HMAC，5 分钟后过期。
- [ ] `POST /api/freecanvas/pair/exchange` 使用专用限流、body 上限和统一错误。
- [ ] 配对码消费与设备 Token 创建位于同一事务，无半完成状态。
- [ ] 设备 Token 固定 `Purpose=freecanvas_device`、30 天有效。
- [ ] 设备 Token 固定模型白名单 `gpt-image-2,grok-imagine-video`，请求不能扩大。
- [ ] 普通 Token 创建/更新 API不能写入或修改 Purpose。
- [ ] 数据库直读和 Redis cache 命中均能恢复正确 Purpose。
- [ ] 过期、重放、并发、错误 session、禁用/删除用户测试已覆盖。
- [ ] 并发交换同一配对码只有一次成功。
- [ ] 响应和日志不包含配对码、完整设备 Token 或 KIE Key。
- [ ] 验收者已运行主计划列出的 New API targeted tests 并记录结果。

## Work Log

### 2026-08-23 - 实现待验证

**By:** Codex

**Actions:**
- 在隔离的 New API `codex/kie-official-channel` 工作树加入 5 分钟一次性配对、30 天设备 Token、数据库/Redis purpose 传播、浏览器会话签发与配对交换路由。
- 普通 Token 列表、查询、批量密钥导出和删除路径会排除 `freecanvas_device`；普通 Token JSON 输入不能写入 `Purpose`。
- 已写入模型和控制器回归测试，覆盖一次成功、重放、并发单成功、禁用用户回滚与个人访问令牌拒绝；未推送、未部署，官方渠道保持关闭。

**Remaining:**
- 已通过本地定向 Go 测试；仍需在备份后的 New API 测试环境完成真实浏览器会话、Redis 缓存、过期/删除用户、并发与通用 Token API 回归验证。
- 账户、卡密兑换和设备撤销接口已在 TODO `003` 的同一隔离工作区实现，但仍需和配对流程一起完成集成验收。

### 2026-08-23 - 定向回归通过

**By:** Codex

**Evidence:**
- `go test ./service ./model ./controller -run '^(TestFreeCanvas|TestExchangeFreeCanvas|TestRevokeFreeCanvas|TestCreateFreeCanvas|TestDeleteFreeCanvas)'`：全部通过。
- 修正测试夹具的唯一 `AffCode` 与独立 SQLite 的 Token 列名初始化；不影响生产的用途/令牌契约。

### 2026-08-23 - Todo 创建

**By:** Codex

**Actions:**
- 核准 AuthFlow、Token model limits 和 Redis cache 现状。
- 将配对、用途标记和并发测试设为同一执行项。

**Learnings:**
- Token 名称和模型列表不能替代不可伪造的权限用途字段。

## Notes

- 前置依赖 `001` 完成后才能确定正式/开发上游边界。
