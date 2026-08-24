---
title: "feat: 官方媒体渠道、账户点数与卡密兑换"
type: feat
status: active
date: 2026-08-23
deepened: 2026-08-23
---

# feat: 官方媒体渠道、账户点数与卡密兑换

## Overview

在 DSH FreeCanvas 中提供一个不可编辑、不可删除的“官方媒体渠道”，由已部署的 `JustinQiuck/new-api` 统一承接 KIE 生图和生视频请求；终端用户只看到 FreeCanvas 点数、账户连接和卡密兑换，不接触 KIE Key，也不需要手工填写 New API Base URL 或长期令牌。

首版不建设支付网关、订阅、订单或商城。用户通过外部购买页取得卡密，在 FreeCanvas 内兑换；New API 继续作为唯一额度账本、鉴权边界、供应商网关和失败退款执行方。自定义 BYOK 渠道仍按现有方式在浏览器本地配置，和官方渠道互不覆盖。

本文是前一份 KIE 渠道计划 `docs/plans/2026-08-21-001-feat-kie-new-api-channel-plan.md` 的产品化后续。该计划已经完成 KIE 图片/视频适配与内部连通性验证；本文只规划用户账户、官方渠道封装、点数展示和卡密充值闭环。

## Problem Frame

当前 FreeCanvas 默认渠道虽然已经收敛到 `gpt-image-2` 和 `grok-imagine-video`，但它仍是普通 `ModelChannel`：Base URL、API Key 和模型可被编辑或删除，凭据进入浏览器本地配置和配置导出；用户也没有在画布内连接 New API 账户、查看余额或兑换卡密的入口。

如果直接把公共 New API Key 写进插件，所有用户会共享凭据和额度，密钥可被提取，无法按用户结算。如果要求用户复制长期 New API Token，则暴露面和操作成本仍然过高。因此需要一个轻量但完整的账户连接边界：一次性配对码只负责换取设备令牌，设备令牌由 DSH 插件宿主服务端保存，浏览器永远不读取或持久化它。

## Requirements Trace

### 官方渠道

- **R1.** 配置中始终存在且只存在一个官方渠道，固定支持 `gpt-image-2`（图片）和 `grok-imagine-video`（视频）。
- **R2.** 官方渠道的名称、Base URL、鉴权方式、模型列表和渠道类型由代码生成，用户不能编辑、删除或通过配置导入覆盖。
- **R3.** 自定义 BYOK 渠道继续允许新增、编辑、删除、导入和导出；官方渠道故障不能破坏自定义渠道。
- **R4.** 官方请求只能通过 DSH 插件宿主的同源代理访问已配置的 New API，浏览器不得获得官方设备令牌或 KIE Key。

### 账户与点数

- **R5.** 用户通过有效期 5 分钟、仅可消费一次的配对码连接 New API 账户；重放、过期、并发消费和已禁用账户必须失败。
- **R6.** 设备令牌只允许调用两个官方模型和本计划列出的账户/媒体接口；断开连接后服务端令牌被撤销，本地凭据被删除。
- **R7.** New API `User.Quota` 是唯一用户余额账本。面向 FreeCanvas 的展示规则固定为 `1 New API USD 额度单位 = 1000 点`，由服务端使用十进制定点计算并返回字符串。
- **R8.** 用户可在主导航与画布顶栏查看“未连接 / N 点”，打开账户抽屉后刷新余额、连接、充值或断开。
- **R9.** 图片请求完成、视频进入终态和卡密兑换后刷新余额；网络失败时保留最后一次成功余额并明确标注状态，避免把缓存值宣称为实时余额。

### 卡密与商业边界

- **R10.** 用户可在 FreeCanvas 输入卡密并兑换，New API 复用现有 `model.Redeem` 的事务、并发保护、额度入账和审计能力；重复卡密不得重复加点。
- **R11.** “购买卡密”只打开管理员配置的 HTTPS `TopUpLink`；本轮不在插件中收款、创建订单、处理回调或保存支付信息。
- **R12.** KIE `creditsConsumed` 只作为运营成本，不直接显示为用户点数，也不成为卡密面值或用户扣费账本。
- **R13.** 未配置正式售价、失败退款证据、日志脱敏、供应商商业授权和生产 HTTPS 域名之前，官方渠道保持内部测试状态，不对付费用户开放。

## Scope Boundaries

- 首版只支持本机、单用户 DSH。若 DSH 监听非 loopback 地址或经共享反向代理对多人开放，官方账户代理必须默认关闭，直到 DSH 提供可验证的宿主用户身份隔离。
- 不新增 Stripe、微信、支付宝、加密货币、订单、发票、订阅、自动续费、推广返佣或套餐权益。
- 不把 FreeCanvas 功能订阅与算力点数合并；“能否使用高级功能”和“是否有生成余额”继续是两个独立问题。
- 不把官方渠道扩展为任意供应商代理，不开放任意 URL、任意路径、任意方法或任意模型。
- 不提供 KIE 文本模型；画布文本模型继续由 DSH 或用户的自定义渠道承担。
- 不迁移现有自定义渠道数据，不尝试把用户已有 API Key 自动转为官方账户。
- 不改画布、素材和生成记录的浏览器本地存储模式。
- 不在本轮解决多设备余额推送；首版使用进入页面、操作完成和手动点击刷新。
- New API 保持 AGPL-3.0 及其商业许可声明；部署、分发和修改必须继续满足该仓库的许可证义务。

## Context & Research

### FreeCanvas 现状

- `web/src/stores/use-config-store.ts` 的 `ModelChannel` 尚无 `official/custom` 类型，渠道、Base URL 和 API Key均进入 Zustand 本地持久化；`isAiConfigReady` 也统一要求 API Key。
- `web/src/components/layout/app-config-modal.tsx` 对每个渠道都显示编辑和删除操作；`web/src/components/layout/channel-editor-drawer.tsx` 可修改全部渠道字段。
- `web/src/services/config-file.ts` 会导出完整 AI 配置，因此官方设备令牌不能进入 `AiConfig`。
- 图片请求使用 `/v1/images/generations` 和 `/v1/images/edits`；视频使用 `/v1/videos`、`/v1/videos/:task_id` 与 `/v1/videos/:task_id/content`。
- `web/src/components/layout/user-status-actions.tsx` 同时被主导航和 `web/src/components/canvas/canvas-top-bar.tsx` 使用，适合作为统一点数入口；画布 UI 规范要求该入口保持扁平、低视觉重量。
- 插件宿主 `plugins/dsh-freecanvas/lib/index.js` 已注入 `webServer`，并通过同源路径提供画布和 Agent bootstrap，具备新增受限官方 API 代理的正确边界。

### New API 现状

本计划基于 `JustinQiuck/new-api` 的提交 `a867f99902366d4741ad63416e6f7b4ddf96ad75` 核准：

- `model/redemption.go` 的 `Redeem` 已在事务内使用状态更新和行级/并发保护，成功后增加用户 Quota 并同步缓存；`model/redemption_test.go` 已覆盖重复兑换和并发仅一次成功。
- `controller/user.go` 的 `TopUp` 已使用用户锁和支付合规守卫，但当前错误日志会写入完整 `req.Key`，商业开放前必须改为只记录卡密 ID、短哈希或固定掩码。
- `model/auth_flow.go` 已提供随机 256-bit 一次性 token、HMAC 持久化、用途绑定、过期与 `ConsumeAuthFlowWithAction` 原子消费，可直接增加 FreeCanvas 配对用途。
- `model.Token` 和 `middleware.TokenAuth` 已支持模型白名单；`UnlimitedQuota=true` 只取消 token 自身额度上限，用户 `User.Quota` 仍由现有预扣、结算和退款路径约束。
- `common.QuotaPerUnit`、`User.Quota`、`service/quota.go` 和现有 billing session 是权威计费链路；没有必要创建第二套点数表。
- 现有 Web 钱包已经支持卡密兑换和 `TopUpLink`，因此首版只需补充 FreeCanvas 配对入口与窄化 API，不重做商城。

### Security References

- OWASP Session Management Cheat Sheet：浏览器长期凭据应使用受保护 Cookie 或 BFF/服务端边界，不应放进 `localStorage`；敏感响应使用 `Cache-Control: no-store`。
  `https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html`
- OWASP CSRF Prevention Cheat Sheet：SameSite 只是纵深防御，敏感浏览器操作仍应验证 Origin/Referer；配对码签发必须要求真实浏览器会话。
  `https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html`
- OWASP REST Security Cheat Sheet：凭据和令牌只允许经 HTTPS 传输，接口采用最小权限、输入限制和安全错误响应。
  `https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html`
- OWASP Transaction Authorization Cheat Sheet：授权凭据应一次性、短时有效并防止重放；本计划用现有 AuthFlow 承担该语义。
  `https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html`

## Key Technical Decisions

### 1. 一次性配对，不在插件内登录 New API

不在 FreeCanvas 内嵌 New API 的用户名/密码登录，也不把 New API JWT、刷新 Cookie或长期 API Token 交给浏览器。用户先在 New API 钱包页的已登录会话中生成 5 分钟配对码，再粘贴到 FreeCanvas。

New API 原子消费配对码并创建独立设备令牌。该令牌固定 `ModelLimitsEnabled=true`、模型为 `gpt-image-2,grok-imagine-video`，同时记录设备显示名和 30 天有效期。`UnlimitedQuota=true` 仅避免重复维护 token 额度，实际支出仍从所属用户 `User.Quota` 扣除。

### 2. 设备令牌由 DSH 插件宿主代持

浏览器把配对码发给同源 `/dsh-freecanvas/official-api/pair/exchange`。插件宿主调用 New API、截获交换得到的设备令牌，以原子写入、文件权限 `0600` 保存到 `~/.infinite-canvas/official-account.json`，只向浏览器返回脱敏账户状态。浏览器请求官方接口时，宿主丢弃来访的 `Authorization`，再注入服务端设备令牌。

该文件不得进入配置导出、WebDAV 同步、前端 store、日志、错误正文或浏览器响应。断开连接时先请求 New API 撤销当前设备令牌，再删除本地文件；若远端暂时不可达，则将本地令牌隔离为不可用并提示用户稍后在 New API 设备列表撤销，不能继续静默使用。

### 3. 官方渠道是代码派生对象，不是可编辑配置

`ModelChannel` 增加 `kind: "official" | "custom"`。官方渠道使用固定 ID、固定同源 Base URL 和固定两个模型，由规范化函数每次在内存中重建；持久化和配置文件只保存自定义渠道及默认模型选择。

导入旧配置或恶意配置时，任何伪造的 `kind=official`、固定 ID、官方 Base URL 或官方模型覆盖都会被丢弃，然后重新插入唯一官方渠道。官方渠道没有编辑、删除和 API Key 字段入口；自定义渠道行为保持不变。

### 4. New API Quota 是唯一账本，点数只是展示单位

不新增 FreeCanvas points 表，也不从 KIE credits 反推用户余额。New API 服务端使用 decimal 计算：

```text
FreeCanvas points = User.Quota / QuotaPerUnit × 1000
```

接口用十进制字符串返回 `points` 和 `used_points`，前端最多显示两位小数，不使用 JavaScript 浮点自行换算。卡密增加的点数也由兑换响应按相同规则返回。以后即便调整 KIE 成本或模型售价，用户钱包和供应商成本仍然独立。

### 5. 固定路由白名单，不建设通用反向代理

宿主代理只接受以下组合，其他请求直接 404/405：

| 用途 | 方法 | 路径 |
| --- | --- | --- |
| 交换配对码 | POST | `/api/freecanvas/pair/exchange` |
| 账户状态 | GET | `/api/freecanvas/account` |
| 兑换卡密 | POST | `/api/freecanvas/redeem` |
| 断开设备 | DELETE | `/api/freecanvas/device` |
| 文生图 | POST | `/v1/images/generations` |
| 图生图 | POST | `/v1/images/edits` |
| 创建视频 | POST | `/v1/videos` |
| 查询视频 | GET | `/v1/videos/:task_id` |
| 下载视频 | GET | `/v1/videos/:task_id/content` |

代理设置请求体上限、连接/读取超时、流式转发大响应、固定上游 Origin，并只透传必要头；不得接受完整 URL、路径穿越、额外 query 鉴权或浏览器自带 Authorization。生产上游必须是 HTTPS，只有显式开发模式允许 loopback HTTP。

### 6. 卡密购买外跳，兑换留在 FreeCanvas

`GET /api/freecanvas/account` 返回管理员已验证的 HTTPS `topup_link`。账户抽屉的“购买卡密”以 `noopener,noreferrer` 打开新标签；没有配置时显示“请联系运营方购买”，不拼接用户、token 或余额到 URL。

未连接时无法调用 `/account`，因此 DSH 宿主另有一个可公开给浏览器的 `officialAccountPortalUrl` 配置，只指向 New API 的登录/钱包配对页面，不包含 API 地址、用户参数或凭据。该地址和 `TopUpLink` 均只接受可解析的 HTTPS URL。

用户在抽屉内输入卡密后调用 `/api/freecanvas/redeem`。New API 控制器复用 `model.Redeem`，只返回成功、增加点数和最新余额；错误统一为“卡密无效、已使用或已过期”，避免枚举卡密状态。输入框完成后立即清空，不写本地存储。

## User Flows

### 首次连接

1. 用户点击顶栏“未连接”，账户抽屉说明官方渠道只用于生图和视频。
2. 用户点击“获取配对码”，打开 New API 钱包的 FreeCanvas 连接卡片。
3. New API 已登录用户点击“生成配对码”，真实浏览器会话签发 5 分钟一次性代码。
4. 用户把代码粘贴到 FreeCanvas；宿主代理交换并服务端保存设备令牌。
5. FreeCanvas 获取脱敏账户状态，显示当前点数，官方两个模型变为可用。

### 充值与兑换

1. 用户点击“充值”，有 `TopUpLink` 时打开外部卡密购买页；无链接时展示运营联系方式/说明。
2. 用户取得卡密后回到抽屉输入并提交。
3. New API 原子兑换，返回增加点数和最新余额；输入框清空并显示结果。
4. 重复点击、并发请求或重复卡密只允许一次入账。

### 生成与余额刷新

1. 用户选中官方图片或视频模型；若未连接，统一打开账户抽屉，不再打开普通渠道配置。
2. 浏览器调用同源官方代理，宿主注入设备令牌，New API 按现有价格预扣和结算。
3. 图片完成后刷新余额；视频在 completed/failed 终态后刷新余额。
4. 刷新失败时保留最后成功值并显示“余额可能有延迟”，用户可手动刷新。

### 断开

1. 用户二次确认“断开后需重新配对”。
2. 宿主调用 New API 撤销当前设备令牌，再删除/隔离本地凭据。
3. UI 回到“未连接”，官方渠道保留但不可生成，自定义渠道不受影响。

## API Contracts

### New API：签发配对码

`POST /api/user/freecanvas/pair`

- Auth：现有用户 JWT 且必须通过 `requireBrowserSession`，不接受管理 API Key 或 relay token。
- CSRF：沿用浏览器会话的 Origin 校验与 SameSite 防护。
- Response：`{ pair_code, expires_at }`；`Cache-Control: no-store`。
- 服务端只持久化 HMAC，不保存或记录明文 `pair_code`。

### New API：交换配对码

`POST /api/freecanvas/pair/exchange`

- Auth：无长期凭据；`pair_code` 本身是 5 分钟一次性 bearer proof。
- Request：`{ pair_code, device_name }`，严格长度与字符白名单；专用高强度限流。
- 原子事务：消费 AuthFlow、复核用户状态、创建模型受限设备令牌；任一步失败不得留下可用令牌。
- Response：`{ access_token, expires_at, account }`，仅供 DSH 宿主消费；`Cache-Control: no-store`。
- Error：不区分不存在、已消费和已过期，避免枚举。

### New API：账户状态

`GET /api/freecanvas/account`

- Auth：`TokenAuth`，并强制认证上下文的 `Token.Purpose=freecanvas_device`；不接受用户 JWT 或普通 relay token。
- Response：`{ connected, points, used_points, points_scale: 1000, topup_link, token_expires_at }`。
- `points` 字段是 decimal string；不得返回 raw quota、用户邮箱、KIE credits、渠道 Key 或完整 Token。

### New API：兑换卡密

`POST /api/freecanvas/redeem`

- Auth：`TokenAuth` + `Token.Purpose=freecanvas_device`；使用 `CriticalRateLimit`、用户级锁和现有 Payment Compliance 守卫。
- Request：`{ code }`，限制长度、字符集和 body 大小。
- Response：`{ success: true, added_points, points }`。
- Error：统一安全错误；日志只记录 user ID、redemption ID/短哈希和结果，不记录明文 code。

### New API：撤销当前设备

`DELETE /api/freecanvas/device`

- Auth：`TokenAuth` + `Token.Purpose=freecanvas_device`。
- 行为：只禁用/删除当前 token ID，不允许指定其他 token ID。
- Response：`204 No Content`；重复调用保持幂等。

### DSH 同源代理

浏览器统一访问 `/dsh-freecanvas/official-api/*`。配对交换接口由宿主剥离 `access_token` 后保存，返回 `{ connected, points, token_expires_at }`；其余接口由宿主注入设备令牌。所有账户响应添加 `Cache-Control: no-store`，所有错误都经过固定安全映射。

`GET /dsh-freecanvas/official-api/status` 是唯一纯本地状态接口，返回 `{ enabled, connected, account_portal_url, token_expires_at }`；它不返回 `officialApiUrl`、本地文件路径或任何令牌。未连接用户依靠其中的 `account_portal_url` 打开配对页面。

## Execution Order and PR Boundaries

1. **New API PR：** Unit 1-3。先落配对、`Token.Purpose`、点数/兑换接口和钱包配对入口；合并后仍不开放 FreeCanvas 官方渠道。
2. **FreeCanvas PR：** Unit 0、4-6。接入默认关闭的宿主代理、官方渠道状态和 UI；没有部署配置时只能看到“暂未开放”。
3. **部署与验收：** Unit 7。部署两个已合并提交，使用内测账户完成安全、计费、退款和卡密证据。
4. **激活审批：** 只有 Unit 7 全部通过后，单独确认把 `officialChannelEnabled` 从 false 切换为 true；实现、部署和商业激活不在同一次默认授权中完成。

## Durable Todo Queue

可执行工作项保存在 `.context/compound-engineering/todos/`。执行时一次只领取依赖已完成的 TODO；完成验收标准后，把文件名和 frontmatter 的 `ready` 改为 `complete`，再解锁下游项。

| ID | Status | Priority | Task | Dependencies |
| --- | --- | --- | --- | --- |
| `001` | ready | P1 | [锁定官方渠道配置与默认关闭门槛](../../.context/compound-engineering/todos/001-ready-p1-lock-official-channel-gates.md) | 无 |
| `002` | ready | P1 | [为 New API 增加 FreeCanvas 一次性配对](../../.context/compound-engineering/todos/002-ready-p1-add-new-api-freecanvas-pairing.md) | `001` |
| `003` | ready | P1 | [增加 New API 点数与卡密兑换接口](../../.context/compound-engineering/todos/003-ready-p1-add-new-api-points-redemption-api.md) | `002` |
| `004` | ready | P2 | [在 New API 钱包增加 FreeCanvas 配对入口](../../.context/compound-engineering/todos/004-ready-p2-add-new-api-wallet-pairing-ui.md) | `002`, `003` |
| `005` | ready | P1 | [实现 DSH 官方凭据保险箱与固定代理](../../.context/compound-engineering/todos/005-ready-p1-add-dsh-official-api-proxy.md) | `001`, `002`, `003` |
| `006` | ready | P1 | [建模不可变官方渠道并统一生成检查](../../.context/compound-engineering/todos/006-ready-p1-model-immutable-official-channel.md) | `005` |
| `007` | ready | P2 | [实现官方渠道卡片、点数入口与账户抽屉](../../.context/compound-engineering/todos/007-ready-p2-build-official-account-ui.md) | `004`, `006` |
| `008` | pending | P1 | [验证并审批开启付费官方渠道](../../.context/compound-engineering/todos/008-pending-p1-validate-and-activate-paid-channel.md) | `001`-`007` + 独立部署/激活授权 |

当前唯一无阻塞执行项是 `001`。`008` 有意保持 `pending`，因为真实服务器变更、扣费测试和商业激活需要后续分别确认。

### 执行快照

`001` 的插件默认关闭配置，以及 `002`/`003` 的 New API 配对、钱包代码已经在各自隔离分支完成实现，但都尚未通过目标测试、合并或部署验收，因此仍保持 `ready`，下游 TODO 不得因代码存在而提前解锁。官方渠道也仍保持关闭。

## Implementation Units

- [ ] **Unit 0: 锁定运营配置与默认关闭门槛**

**Goal:** 在写用户入口前确定不会写死在前端的部署值和内测开关。

**Requirements:** R1, R4, R11, R13

**Dependencies:** 前一份 KIE 渠道计划已完成 Unit 1-3。

**Files:**
- Modify: `plugins/dsh-freecanvas/lib/index.js`
- Modify: `plugins/dsh-freecanvas/README.md`
- Create in New API: `docs/freecanvas-operations.md`

**Approach:**
- 插件宿主新增 `officialApiUrl`、`officialAccountPortalUrl` 与 `officialChannelEnabled` 配置；`officialApiUrl` 不进入浏览器响应或配置，`officialAccountPortalUrl` 只作为未连接用户打开的钱包页面。生产地址只接受 HTTPS，显式开发模式才允许 `127.0.0.1/localhost` HTTP。
- 默认 `officialChannelEnabled=false`。只有生产域名、卡密购买页、正式模型价格、KIE 商业授权、失败退款与日志脱敏全部通过验收后才由运营开启。
- 记录 `TopUpLink`、点数换算、卡密面值、模型售价、KIE Key 轮换和应急关闭步骤；不在文档或截图中记录任何密钥。

**Acceptance:**
- 未配置或未开启时，前端只显示“官方渠道暂未开放”，不会向默认公网地址盲发请求。
- DSH 非 loopback/多人共享模式下，宿主拒绝启用官方账户代理并给出明确运维错误。

- [ ] **Unit 1: 在 New API 增加一次性配对和受限设备令牌**

**Goal:** 用户无需向 FreeCanvas 提供账户密码或长期 Token，即可给单台 DSH 授予最小媒体调用权限。

**Requirements:** R5, R6

**Dependencies:** Unit 0

**Files (relative to `JustinQiuck/new-api`):**
- Modify: `model/auth_flow.go`
- Modify: `model/token.go`
- Modify: `model/token_cache.go`
- Create: `model/freecanvas_pairing.go`
- Create: `model/freecanvas_pairing_test.go`
- Create: `controller/freecanvas.go`
- Create: `controller/freecanvas_test.go`
- Modify: `middleware/auth.go`
- Modify: `router/api-router.go`
- Modify only if dedicated limiter is required: `middleware/rate-limit.go`

**Approach:**
- 新增 `AuthFlowPurposeFreeCanvasPair = "freecanvas_pair"`，5 分钟 TTL；签发端要求 `requireBrowserSession` 并绑定 user ID/session ID。
- 交换端调用 `ConsumeAuthFlowWithAction`，在同一事务中复核用户状态并创建 30 天设备令牌；令牌名称使用 `DSH FreeCanvas · <随机短后缀>`，不信任浏览器传入名称作为日志正文。
- 给 `model.Token` 增加 `json:"-"`、不可由普通用户 API 写入的 `Purpose` 字段，固定值 `freecanvas_device`；GORM `AutoMigrate` 增加列，旧 token 默认为空。同步更新 Redis token cache 与 `TokenAuth` 上下文，避免缓存命中时丢失 purpose。账户/兑换端点必须检查该 purpose，不能使用 token 名称或模型列表代替安全标记。
- 设备令牌固定允许 `gpt-image-2,grok-imagine-video`，不能由请求扩大；普通 relay token 即使配置了相同模型列表，也不能调用 FreeCanvas 账户/兑换端点。
- 所有签发和交换响应 `no-store`，不记录明文配对码或 access token；交换端设置窄 body 上限、失败统一错误和独立速率限制。

**Test scenarios:**
- 正常配对只生成一个受限设备令牌，两个模型允许，其他模型拒绝。
- 过期、错误用途、错误 session、已禁用/删除用户、格式错误均失败且不创建 token。
- 同一配对码并发交换只有一个成功；第二次重放得到统一错误。
- 数据库事务失败时 AuthFlow 与 token 不得出现“已消费但无令牌”或“有令牌但未消费”的半完成状态。
- 数据库直读与 Redis cache 命中都能得到相同 `freecanvas_device` purpose；普通 token purpose 为空且不能由创建/更新 token API 篡改。

**Acceptance:**
- 用户密码、JWT、refresh cookie、KIE Key 都不经过 FreeCanvas；只有一次性配对码跨过用户复制边界。

- [ ] **Unit 2: 在 New API 暴露窄账户、点数、兑换与撤销接口**

**Goal:** 复用现有 Quota 和 Redeem，形成可审计且不会重复入账的 FreeCanvas 钱包接口。

**Requirements:** R7, R10, R11, R12

**Dependencies:** Unit 1

**Files (relative to `JustinQiuck/new-api`):**
- Modify: `controller/freecanvas.go`
- Create: `service/freecanvas_points.go`
- Create: `service/freecanvas_points_test.go`
- Modify: `controller/user.go`
- Modify: `router/api-router.go`
- Modify/Test: `controller/freecanvas_test.go`
- Verify/reuse: `model/redemption.go`
- Verify/reuse: `model/redemption_test.go`

**Approach:**
- `service/freecanvas_points.go` 是唯一换算函数：raw quota → decimal string points；不创建 points 数据库列或重复账本。
- `/account` 从当前 token 所属用户读取权威 Quota，返回脱敏余额、有效期和经过 `https`/allowlist 校验的 `TopUpLink`。
- `/redeem` 复用 `model.Redeem` 和用户级 try-lock；成功后在同一请求重新读取余额并返回 `added_points/points`。
- 修改现有 `controller/user.go`，禁止在 TopUp 错误日志中输出完整 `req.Key`；所有现有与新增兑换入口使用同一脱敏 helper。
- `/device` 只从认证上下文取得当前 token ID 并撤销它，忽略/拒绝客户端指定的其他 ID；数据库状态更新成功后同步失效本地/Redis token cache，不能让已撤销 token 在缓存 TTL 内继续调用。

**Test scenarios:**
- 零余额、大余额、非整数换算、`QuotaPerUnit<=0` 均得到稳定结果或安全失败，不产生 `NaN/Infinity`。
- 有效卡密增加一次余额；重复、过期、禁用、错误卡密返回统一错误。
- 同一卡密并发兑换只有一次成功，最新余额与数据库 Quota 一致。
- 支付合规未确认时卡密管理/兑换按现有策略拒绝，不能绕过守卫。
- 撤销只影响当前设备 token；重复撤销幂等，其他设备和用户 token 不变。
- 捕获日志验证配对码、access token、卡密明文和 KIE Key均不存在。

**Acceptance:**
- 任意时刻只有 `User.Quota` 决定余额；点数接口和 New API 钱包显示可通过换算相互核对。

- [ ] **Unit 3: 在 New API 钱包增加 FreeCanvas 配对入口和运营说明**

**Goal:** 用户能在受信任的 New API 页面生成配对码，运营能创建卡密并配置购买入口。

**Requirements:** R5, R11, R13

**Dependencies:** Unit 1-2

**Files (relative to `JustinQiuck/new-api`):**
- Modify: `web/src/features/wallet/api.ts`
- Modify: `web/src/features/wallet/types.ts`
- Create: `web/src/features/wallet/components/freecanvas-pairing-card.tsx`
- Modify: `web/src/features/wallet/index.tsx`
- Modify: `web/src/i18n/locales/zh.json`
- Modify: `web/src/i18n/locales/en.json`
- Modify other shipped locale JSON files with English fallback text
- Create/Modify: `docs/freecanvas-operations.md`

**Approach:**
- 钱包中新增“连接 DSH FreeCanvas”卡片；用户主动点击后才生成配对码，显示倒计时、一次性警告和复制按钮，离开页面不把代码持久化。
- 配对码过期后必须重新生成；不提供历史明文列表。
- 运维文档记录卡密批次、面值与用户点数的对应关系，复用现有管理员 redemption 功能；首版购买页由 `TopUpLink` 指向外部卡密销售/联系页。
- 文档明确生成内容会发送给 KIE、点数不等同于 KIE credits、卡密一经兑换不可转移，以及退款/异常处理渠道。

**Test scenarios:**
- 未登录和非浏览器会话不能生成配对码。
- 成功、加载、限流、过期、复制失败和重新生成状态均有可操作反馈。
- 页面刷新后旧配对码不从 localStorage/sessionStorage 恢复。

**Acceptance:**
- 一位已登录用户可在 1 分钟内完成“生成代码 → 复制 → 回到 FreeCanvas”；运营无需手工给用户创建长期 API Token。

- [ ] **Unit 4: 在 DSH 插件宿主实现凭据保险箱与固定代理**

**Goal:** 把官方设备令牌留在 Node 宿主，并限制浏览器能调用的上游能力。

**Requirements:** R4, R6, R10

**Dependencies:** Unit 1-2

**Files:**
- Create: `plugins/dsh-freecanvas/lib/official-account-store.js`
- Create: `plugins/dsh-freecanvas/lib/official-api-proxy.js`
- Modify: `plugins/dsh-freecanvas/lib/index.js`
- Modify: `plugins/dsh-freecanvas/package.json`
- Create: `plugins/dsh-freecanvas/test/official-account-store.test.js`
- Create: `plugins/dsh-freecanvas/test/official-api-proxy.test.js`

**Approach:**
- store 只管理一个明确文件 `~/.infinite-canvas/official-account.json`：校验 schema、临时文件原子替换、目录 `0700`、文件 `0600`；损坏文件拒绝覆盖并返回需重新配对状态。
- 该凭据文件不进入插件支持包、配置导出、WebDAV 或应用自建备份；运维文档说明操作系统整机备份可能复制它，依靠 30 天有效期和远端撤销降低备份泄漏窗口。
- 交换配对码时宿主解析上游 JSON，保存 token 后从响应对象删除 token；若保存失败，立即请求撤销刚创建的 token，并返回失败。
- 代理使用固定 method/path allowlist、请求体上限、超时和必要响应头；大图片/视频内容流式传输，账户 JSON 限制小体积后再解析。
- 使用更具体的 `OFFICIAL_API_PREFIX=/dsh-freecanvas/official-api`，在通用画布 `PROXY_PREFIX=/dsh-freecanvas` 之前注册，并用测试确认宿主路由采用预期优先级，避免账户请求被 SPA fallback 吞掉。
- 对所有浏览器请求要求 `Sec-Fetch-Site` 为 `same-origin/none`；对配对、兑换和断开等变更请求再校验 `Origin` 与当前 DSH Host 一致并限制 Content-Type，防止跨站表单或脚本触发本机操作。
- 丢弃浏览器 Authorization、Cookie、Host、Forwarded 和 hop-by-hop headers；只注入本地 token。日志只记录固定路由名、状态码、耗时和 request ID。
- 若请求来源不是可信本机 DSH 页面、插件未开启、上游不符合 HTTPS 规则或本地凭据过期，拒绝请求。
- 断开连接采用“远端撤销成功 → 本地删除”；远端失败时把本地文件重命名为明确的 disabled 文件，后续代理不得再加载，用户可在 New API 手工撤销。

**Test scenarios:**
- 原子写入、权限、损坏 JSON、过期 token、并发读写和保存失败回滚。
- allowlist 中每个路由正常转发；未知路径、方法、完整 URL、路径穿越、超大 body 和任意 query 失败。
- `/status` 只返回开关、连接状态、公开钱包 URL 和过期时间；官方代理前缀不会落入画布 SPA handler。
- 浏览器伪造 Authorization/Cookie 不会覆盖宿主 token；响应和日志不包含 token。
- 跨站 `Origin`、`Sec-Fetch-Site=cross-site` 和不受支持 Content-Type 无法触发配对、兑换或断开。
- 配对成功响应不包含 `access_token`；配对存储失败会撤销远端 token。
- 非 loopback/共享访问模式、HTTP 生产上游和超时均 fail closed。

**Acceptance:**
- 浏览器 DevTools、配置导出、WebDAV 文件和普通日志均无法发现官方设备令牌；删除本地凭据后官方请求立即不可用。

- [ ] **Unit 5: 把官方渠道建模为不可变渠道并统一生成前置检查**

**Goal:** 官方渠道在所有入口中表现一致，同时不破坏自定义渠道。

**Requirements:** R1, R2, R3, R4

**Dependencies:** Unit 4

**Files:**
- Modify: `web/src/stores/use-config-store.ts`
- Create: `web/src/stores/use-official-account-store.ts`
- Create: `web/src/services/api/official-account.ts`
- Create: `web/src/hooks/use-generation-access.ts`
- Modify: `web/src/services/config-file.ts`
- Modify: `web/src/components/layout/client-root-init.tsx`
- Modify: `web/src/services/api/image.ts`
- Modify: `web/src/services/api/video.ts`
- Modify: `web/src/pages/canvas/project.tsx`
- Modify: `web/src/pages/canvas/hooks/use-plugin-host.tsx`
- Modify: `web/src/pages/image/index.tsx`
- Modify: `web/src/pages/video/index.tsx`
- Modify: `web/package.json`
- Create: `web/src/stores/use-config-store.test.ts`
- Create: `web/src/services/api/official-account.test.ts`

**Approach:**
- 增加稳定 `OFFICIAL_CHANNEL_ID`、`kind` 和官方渠道工厂；normalize 时移除持久化/导入中的伪官方记录，再插入一个代码生成记录。
- 配置导出显式排除官方渠道数据和全部官方账户状态；自定义渠道仍按现有安全提示导出其用户 Key。
- 官方渠道的请求 Base URL 固定为同源 `/dsh-freecanvas/official-api`，`aiHeaders` 对官方请求不添加 Authorization，自定义渠道保持原逻辑。
- `useOfficialAccountStore` 只保存脱敏状态和最后刷新时间，不持久化敏感字段；启动时向宿主查询连接状态。
- `useGenerationAccess` 统一替代各页面重复的 `isAiConfigReady` 分支：自定义渠道缺配置时打开普通配置，官方渠道未连接时打开账户抽屉。
- 图片完成、视频进入 completed/failed 终态后异步刷新点数；刷新失败不把生成结果改判为失败。

**Test scenarios:**
- 空配置、旧配置、重复官方项、伪造官方 ID 和恶意导入最终都只有一个不可变官方渠道。
- 自定义渠道增删改、默认模型选择和配置导入导出行为不回归。
- 官方请求没有浏览器 Authorization，且路径只命中同源代理；自定义请求仍携带用户 API Key。
- 未连接官方渠道会打开账户抽屉；未配置自定义渠道仍打开渠道配置。
- 余额刷新失败只更新 stale/error 状态，不清空最后成功余额或破坏生成结果。

**Acceptance:**
- 所有生图/生视频入口使用同一连接判断；不存在某个页面绕过账户检查或退回 API Key 输入框的情况。

- [ ] **Unit 6: 实现官方渠道卡片、点数入口和账户抽屉**

**Goal:** 用户能自然完成连接、看余额、购买卡密、兑换和断开，且官方渠道不可编辑删除。

**Requirements:** R2, R8, R9, R10, R11

**Dependencies:** Unit 5

**Files:**
- Create: `web/src/components/layout/official-account-drawer.tsx`
- Modify: `web/src/components/layout/app-config-modal.tsx`
- Modify: `web/src/components/layout/user-status-actions.tsx`
- Verify/modify if layout spacing requires: `web/src/components/canvas/canvas-top-bar.tsx`
- Modify: `web/src/i18n/locales/zh-CN.ts`
- Modify: `web/src/i18n/locales/en-US.ts`

**Approach:**
- 配置页把官方渠道置顶，显示“官方”“图片 + 视频”和连接状态；不渲染铅笔/删除按钮，改为“连接账户/查看点数”。自定义渠道保留当前按钮。
- `UserStatusActions` 增加扁平点数文本按钮：未连接显示“未连接”，已连接显示格式化点数；在主导航和画布顶栏共用，不增加悬浮胶囊或遮挡画布。
- 账户抽屉包含状态、最后刷新时间、连接步骤、配对码输入、卡密输入、购买链接、断开确认和隐私说明。
- 完整覆盖 loading、未开放、未连接、连接中、已连接、余额 stale、余额不足、卡密成功/失败、token 过期、离线和断开失败。
- 卡密和配对码输入使用密码式可见性切换；提交成功/失败后不持久化，成功立即清空。

**Test scenarios:**
- 官方渠道没有编辑/删除 DOM 操作，自定义渠道仍可编辑删除。
- 窄窗口和画布顶栏不遮挡现有按钮；长余额、中文/英文、深浅主题均可读。
- 键盘可达、焦点返回、错误关联输入、禁用重复提交、断开二次确认均正确。
- `TopUpLink` 缺失或非 HTTPS 时不渲染可点击购买按钮。

**Acceptance:**
- 新用户不进入普通“渠道配置”也能理解并完成官方账户连接和卡密兑换；BYOK 用户仍能按原流程工作。

- [ ] **Unit 7: 文档、人工验收与付费开放闸门**

**Goal:** 把“代码完成”“本地可测”“服务器已配置”和“可向付费用户开放”分开验收。

**Requirements:** R9, R12, R13

**Dependencies:** Unit 0-6

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/content/docs/progress/todo.mdx`
- Modify: `docs/content/docs/progress/pending-test.mdx`
- Modify: `plugins/dsh-freecanvas/README.md`
- Link from: `docs/plans/2026-08-21-001-feat-kie-new-api-channel-plan.md`
- Modify only after user confirms testing: `docs/content/docs/overview/features.mdx`
- Modify in New API: `docs/freecanvas-operations.md`

**Approach:**
- 实现完成后先写 `pending-test.mdx` 和 `CHANGELOG.md` Unreleased；用户确认真实测试通过后，才把能力写入正式 features 文档。
- 使用一次性测试用户、短期卡密和短期设备 token 完成验收，结束后撤销 token、作废未用卡密并清理临时文件。
- 将上线闸门逐项留证：真实图片成功、真实视频成功、余额不足前置拒绝、可控失败单次退款、重复卡密单次入账、日志脱敏、token 不进浏览器、重启后凭据仍安全、断开后远端撤销、备份与恢复。
- 最终确认 KIE 转售/白标商业授权、正式售价与毛利、卡密售后/退款规则、隐私说明、内容审核责任和低余额告警。

**Acceptance:**
- 未通过任一付费开放闸门时 `officialChannelEnabled` 保持 false 或仅对明确内测账户开放。
- 用户测试确认前不把功能写成“已正式支持”，部署验证前不把“已实现”写成“已上线”。

## Requirements Mapping Matrix

| Requirement | Primary unit(s) | Proof |
| --- | --- | --- |
| R1 唯一官方双模型渠道 | Unit 0, 5 | normalize 单测 + 配置页人工验收 |
| R2 不可编辑删除 | Unit 5, 6 | 导入对抗单测 + UI 验收 |
| R3 保留自定义渠道 | Unit 5, 6 | 自定义渠道回归测试 |
| R4 浏览器无官方凭据 | Unit 4, 5 | 代理单测 + DevTools/导出审计 |
| R5 一次性配对 | Unit 1, 3 | 过期/重放/并发测试 |
| R6 最小设备权限与撤销 | Unit 1, 2, 4 | 模型拒绝 + 当前 token 撤销测试 |
| R7 Quota 唯一账本 | Unit 2 | decimal 换算和账本核对 |
| R8 顶栏点数入口 | Unit 6 | 主导航/画布顶栏验收 |
| R9 操作后余额刷新 | Unit 5, 6, 7 | 成功/失败/stale 场景 |
| R10 卡密只入账一次 | Unit 2, 4, 6 | Redeem 并发测试 + E2E |
| R11 外部购买链接 | Unit 0, 2, 6 | HTTPS 校验 + 空链接状态 |
| R12 成本与用户点数分离 | Unit 2, 7 | 接口字段审计 + 双账核对 |
| R13 商业开放闸门 | Unit 0, 7 | 上线清单逐项证据 |

## System-Wide Impact

- **Interaction graph:** New API Web 钱包签发一次性配对码 → FreeCanvas 浏览器把配对码交给 DSH 同源宿主 → 宿主换取并保管设备 token → 固定代理调用 New API → New API 通过现有 KIE 渠道生成并从 `User.Quota` 结算。
- **State ownership:** 配对 AuthFlow、设备 token、Quota 和卡密状态属于 New API；官方 token 文件属于 DSH 宿主；浏览器只持有脱敏连接状态和最后余额；KIE Key 只属于 New API 管理端渠道配置。
- **Failure propagation:** New API/KIE 失败沿现有媒体接口返回；余额刷新失败独立处理。代理超时不应导致浏览器重试卡密兑换，兑换重试仍由服务端幂等/单次状态保证。
- **Lifecycle:** 配对码 5 分钟后过期；设备 token 30 天后过期并要求重新配对；断开立即撤销；用户禁用或余额不足由现有 TokenAuth/Quota 路径拒绝。
- **Observability:** 只记录用户/设备内部 ID、固定路由、状态码、耗时、New API request ID 和脱敏兑换标识；不记录 token、配对码、卡密、提示词、素材 URL 或 KIE 原始响应。
- **Data migration:** 不新增 FreeCanvas 业务数据迁移；New API AuthFlow 复用现有表。`Token` 明确新增 `Purpose` 列并由现有 GORM AutoMigrate 创建，旧 token 为空值；部署前备份数据库，并验证 SQLite/MySQL/PostgreSQL 的列新增、Redis 缓存字段与回滚行为。
- **Rollback:** 关闭 `officialChannelEnabled` 即可停止新请求；现有自定义渠道不受影响。回滚前先撤销已签发 FreeCanvas 设备 token，官方渠道 UI 回到“暂未开放”。

## Security Threat Model

1. **配对码被截获并抢先交换：** 代码仅 5 分钟、一次性、HTTPS、no-store、强随机且不进日志；异常设备可在 New API 撤销。若真实滥用仍高，第二阶段再升级为设备 challenge/用户确认，不在首版预建复杂协议。
2. **浏览器利用宿主做代理跳板：** 固定上游、method/path allowlist、model whitelist、body/time limits、丢弃来访鉴权头，并在非单用户本机模式 fail closed。
3. **本地设备 token 泄漏：** token 不进浏览器，目录/文件最小权限，30 天过期，可远端撤销；生产文档明确本机恶意管理员/同用户进程不在该文件权限模型可抵御范围内。
4. **卡密枚举或重放：** CriticalRateLimit、统一错误、输入限制、事务 CAS、用户锁和脱敏日志；成功后同一 code 永远不能再次入账。
5. **账本漂移或双重退款：** 不创建第二账本，所有扣费/退款继续走 New API 既有结算路径；FreeCanvas points 仅是服务端换算后的展示值。

## Risks and Mitigations

| Risk | Impact | Mitigation / gate |
| --- | --- | --- |
| Token purpose 在数据库与 Redis 缓存不一致 | 缓存命中可能放大或拒绝权限 | `Purpose` 作为明确数据库列并进入 token cache；测试直读/缓存两条认证路径，不以名称字符串作为安全边界 |
| DSH 宿主实际存在多人共享访问 | 一个本地 token 被多用户共用 | 首版仅 loopback 单用户，无法验证身份时默认关闭；多用户能力另立计划 |
| 代理上传大参考图占用内存 | 宿主 OOM/DoS | 请求体上限、流式转发、超时和并发限制；不把整个视频下载缓存到内存 |
| `TopUpLink` 指向不可信页面 | 钓鱼或泄露上下文 | 运维配置 HTTPS allowlist，不附带用户/token/query，`noopener,noreferrer` |
| 配对后宿主保存失败 | 产生孤儿 token | 交换响应保存失败即远端撤销；记录无敏感信息的告警 |
| New API 数据库或备份泄漏设备 token/卡密 | 用户额度可能被盗用 | 沿用服务器最小权限和受保护备份，设备 token 30 天到期且可撤销；生产验收检查备份访问、日志与支持包，不新增浏览器副本 |
| 卡密成功但响应丢失 | 用户误以为失败并重试 | 服务端已入账保持权威；重试返回统一错误后自动刷新余额，并提示核对最新点数 |
| 点数比例未来调整 | 用户理解和历史定价混乱 | V1 固定 1000 点/USD 额度单位；变化必须版本化展示契约和公告，不静默更改 |
| KIE 成本或条款变化 | 亏损或无权转售 | 定价/毛利监控、低余额告警、运营急停、书面商业授权作为付费开放阻断项 |

## Verification Strategy

按项目约定，实施代理负责写测试和列出验证命令，但不自行执行构建/测试；由用户或指定验收者运行并回传结果。

### New API targeted verification

```bash
go test ./model -run 'FreeCanvas|AuthFlow|Redeem'
go test ./service -run 'FreeCanvasPoints|Quota|Billing'
go test ./controller -run 'FreeCanvas|TopUp'
```

### DSH plugin host verification

```bash
node --test plugins/dsh-freecanvas/test/official-account-store.test.js
node --test plugins/dsh-freecanvas/test/official-api-proxy.test.js
```

### FreeCanvas frontend verification

```bash
npm --prefix web run test -- --run
npm --prefix web run typecheck
```

### Live internal acceptance order

1. 使用临时用户在 New API 生成配对码，验证一次成功、重放失败、过期失败。
2. 检查浏览器网络、配置导出、WebDAV 和日志，确认没有 access token、配对码、卡密或 KIE Key。
3. 兑换一张低面值卡密，验证只入账一次、余额换算一致、响应丢失后刷新可恢复认知。
4. 使用官方 `gpt-image-2` 完成文生图和图生图，核对扣点与 New API Quota。
5. 使用官方 `grok-imagine-video` 完成创建、轮询和内容下载，核对终态扣点。
6. 制造一次可控上游失败，验证退款只发生一次、重复查询余额不再变化。
7. 重启 DSH，验证凭据仍可用且文件权限正确；断开后验证本地和远端都不可再调用。
8. 撤销测试设备 token、作废剩余卡密并清理临时账号/文件，保留脱敏验收记录。

## Resolved and Deferred Decisions

### Resolved

- **是否另建商业后端：** 不另建；New API 已是账户、Token、Quota、卡密、KIE 适配和退款边界。
- **是否给所有用户一个默认共享 Key：** 不给；每个用户/设备使用受限 token，共享 Key 无法安全计费或撤销。
- **是否把长期 Token 交给浏览器：** 不交；采用一次性配对并由 DSH 宿主代持。
- **是否做复杂充值：** 不做；首版购买外跳，FreeCanvas 只兑换卡密。
- **官方渠道能否删除编辑：** 不能；官方配置由代码派生，自定义渠道继续可编辑删除。
- **点数从哪里来：** 只来自 New API `User.Quota`；卡密兑换增加 Quota，FreeCanvas 只换算展示。

### Deferred / release gates

- 正式 New API HTTPS 域名与 `TopUpLink` 的最终地址。
- 两个模型的正式售价、卡密面值、赠送策略、毛利和低余额阈值。
- KIE 对转售、白标或代充模式的明确商业授权。
- 多用户/远程 DSH 的身份隔离与设备管理 UX。
- 自动支付、订单、发票、退款后台和订阅权益；只有卡密模式验证需求后再独立规划。

## Definition of Done

- 代码层：Unit 1-6 完成，自动化测试已编写，安全审查无高优先级遗留。
- 本地层：官方渠道不可编辑删除，自定义渠道无回归，浏览器看不到官方凭据。
- 服务器层：生产 HTTPS、真实账户、卡密、图片、视频、余额不足和失败退款全部通过。
- 商业层：KIE 授权、正式定价、售后规则、隐私披露、日志脱敏与急停方案均有明确负责人和证据。
- 文档层：先进入 `pending-test.mdx`；只有用户确认测试通过后，才进入正式 features 文档并允许开启付费渠道。
