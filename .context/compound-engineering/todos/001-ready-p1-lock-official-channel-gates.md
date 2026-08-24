---
status: ready
priority: p1
issue_id: "001"
tags: [freecanvas, official-channel, operations, security]
dependencies: []
---

# 锁定官方渠道配置与默认关闭门槛

## Problem Statement

官方媒体渠道需要生产 API、账户门户和启用开关，但这些值不能写进浏览器 AI 配置，也不能在商业条件未完成时默认开启。必须先建立服务端配置与 fail-closed 规则，后续配对、代理和 UI 才有稳定边界。

## Findings

- DSH 插件宿主配置位于 `plugins/dsh-freecanvas/lib/index.js`，当前只有 `canvasUrl` 和 `autoStartAgent`。
- 现有画布运行在 DSH 同源路径下，适合由插件宿主保存官方配置。
- 生产 New API 域名、钱包页面、正式价格和商业授权尚属于上线闸门，不应作为前端默认常量。
- 详细决策见 `docs/plans/2026-08-23-001-feat-official-channel-redemption-plan.md` Unit 0。

## Proposed Solutions

### Option 1: 宿主配置 + 默认关闭（采用）

**Approach:** 在插件宿主增加 `officialApiUrl`、`officialAccountPortalUrl`、`officialChannelEnabled`，并执行 HTTPS、loopback 和共享访问校验。

**Pros:** 凭据边界清楚；可独立部署和激活；浏览器不能覆盖上游。

**Cons:** 需要运维配置和单独激活步骤。

**Effort:** 0.5-1 天

**Risk:** Low

### Option 2: 把默认上游写进前端

**Approach:** 在 `use-config-store.ts` 固定公网地址并默认开启。

**Pros:** 实现最少。

**Cons:** 无法安全分环境；商业闸门失效；用户可篡改或错误暴露上游。

**Effort:** 0.25 天

**Risk:** High

## Recommended Action

采用 Option 1。先完成配置 schema、默认关闭、HTTPS 校验、单用户/loopback 限制和运维说明；不要填入生产密钥，不要开启正式渠道。

## Technical Details

**Affected files:**
- `plugins/dsh-freecanvas/lib/index.js`
- `plugins/dsh-freecanvas/README.md`
- New API: `docs/freecanvas-operations.md`

**Configuration contract:**
- `officialApiUrl`: 仅宿主使用；生产必须 HTTPS。
- `officialAccountPortalUrl`: 可返回浏览器的钱包/配对页面；必须 HTTPS 且不带用户或令牌参数。
- `officialChannelEnabled`: 默认 `false`。

## Resources

- Master plan: `docs/plans/2026-08-23-001-feat-official-channel-redemption-plan.md`
- Previous KIE plan: `docs/plans/2026-08-21-001-feat-kie-new-api-channel-plan.md`

## Acceptance Criteria

- [ ] 三个宿主配置字段已加入并有明确默认值。
- [ ] 未配置 `officialApiUrl` 时返回“官方渠道暂未开放”，不向任何默认公网地址发送请求。
- [ ] 生产 `officialApiUrl` 和 `officialAccountPortalUrl` 只接受 HTTPS。
- [ ] 仅显式开发模式允许 `127.0.0.1`、`localhost` 或 `::1` 的 HTTP。
- [ ] 无法证明为本机单用户 DSH 时，官方账户代理默认拒绝启用。
- [ ] 运维说明覆盖 `TopUpLink`、点数比例、模型价格、Key 轮换和急停步骤。
- [ ] 配置、文档、日志和前端响应均未出现 KIE Key 或设备 Token。
- [ ] `officialChannelEnabled` 仍为 `false`，未执行商业激活。

## Work Log

### 2026-08-23 - Todo 创建

**By:** Codex

**Actions:**
- 从主计划 Unit 0 拆出独立阻断项。
- 固定配置所有权、默认关闭和生产 HTTPS 边界。

**Learnings:**
- 实现完成、服务器部署和商业激活必须分开确认。

### 2026-08-23 - FreeCanvas 宿主配置完成

**By:** Codex

**Actions:**
- 在 `plugins/dsh-freecanvas/lib/index.js` 增加官方 API、账户门户、总开关、单用户模式和开发模式配置。
- 增加仅供宿主使用的 URL 解析：生产只接受无凭据/查询/片段的 HTTPS；开发模式仅允许 loopback HTTP。
- 在插件 README、CHANGELOG 和待测文档说明默认关闭与人工验证边界。

**Remaining:**
- `JustinQiuck/new-api` 的 `docs/freecanvas-operations.md` 已在隔离本地 checkout 实现，仍未提交或推送；必须随 New API 的后续变更落入该仓库，不能在当前 FreeCanvas 仓库伪造为已完成。

### 2026-08-23 - 本地配置门槛测试通过

**By:** Codex

**Evidence:**
- `npm run test:host`：15/15 通过，其中覆盖默认关闭、根 API URL、钱包页面路径及官方路由优先级。
- 未配置服务地址、未启用单用户模式或未开启总开关时仍 fail closed；未部署、未配置 KIE Key、未开启渠道。

## Notes

- 本 TODO 不授权部署、修改服务器或开启正式渠道。
