---
title: "feat: 在 New API 中接入 KIE 官方渠道"
type: feat
status: active
date: 2026-08-21
deepened: 2026-08-21
---

# feat: 在 New API 中接入 KIE 官方渠道

## Overview

在 `JustinQiuck/new-api` 中新增一等 KIE 渠道，让 DSH FreeCanvas 继续使用现有 OpenAI 兼容接口，而不接触 KIE 密钥。首版官方渠道只打通图片和视频两条生成链路，并复用 New API 已有的用户令牌、余额、模型定价、异步任务、退款和日志能力。

> 当前产品决策：FreeCanvas 官方 KIE 渠道仅发布 `gpt-image-2` 与 `grok-imagine-video`。已经实现的 KIE 文本适配保留为后端能力，但不进入官方渠道默认模型、插件验收或商业上线范围；画布文本能力由 DSH 或用户配置的独立文本渠道提供。

实施目标仓库是 `JustinQiuck/new-api`；本文保存在 DSH FreeCanvas 仓库中，作为两端衔接的实施依据。除特别注明外，下文 New API 文件路径均相对于其仓库根目录。

## Problem Frame

FreeCanvas 已具备按能力配置模型渠道和调用 `/v1/responses`、`/v1/images/*`、`/v1/videos*` 的能力，但浏览器直连 KIE 会暴露供应商密钥，也无法形成统一的用户额度和退款闭环。需要把 New API 固定为官方算力网关，由 New API 保存 KIE 密钥、向用户签发独立令牌并承担计费和上游适配。

## Requirements Trace

- R1. FreeCanvas 终端用户的浏览器和 DSH 插件只能拿到 New API 用户令牌；KIE 密钥仅允许经受控管理员会话录入，且不得被接口回显、写入普通日志或进入前端构建资源。
- R2. 保持 FreeCanvas 现有媒体调用面：图片 `/v1/images/generations` 与 `/v1/images/edits`、视频 `/v1/videos` 与 `/v1/videos/:task_id`。
- R3. 首批公开模型名为 `gpt-image-2` 与 `grok-imagine-video`，由 New API 内部映射到 KIE 模型名。
- R4. 用户收费以 New API 配置的模型价格和倍率为准；KIE 的 `creditsConsumed` 只代表上游成本，不能直接成为用户扣费金额。
- R5. KIE 失败、超时和限流必须映射为稳定错误；异步视频失败只能退款一次，重复轮询不得重复结算。
- R6. 首版部署后，FreeCanvas 只需配置 New API 地址和用户令牌，不要求修改现有画布请求协议。

## Scope Boundaries

- 不改 New API 现有账户、充值、订阅、支付或管理员权限体系。
- 不在首版接入音频、音乐、全部 KIE 模型或自动同步 KIE 模型市场。
- 不新增 KIE 回调公网入口；首版复用 New API 的轮询模式，回调和签名校验留待有规模后再做。
- 不把 KIE 上游成本与用户售价绑定；售价、赠送额度和毛利策略由 New API 配置独立决定。
- 不在本轮把 FreeCanvas Pro 功能权益与算力余额合并；功能订阅和生成额度继续是两套概念。
- 不在适配代码阶段默认获得 KIE 转售、代充或白标授权；付费公开发布前必须单独确认供应商条款或取得书面许可。
- 不承诺本轮完成服务器部署、真实充值或带密钥端到端验证；这些属于计划后的实施与上线验收。

## Context & Research

### Relevant Code and Patterns

- `constant/channel.go`、`constant/api_type.go`、`common/api_type.go` 和 `relay/relay_adaptor.go` 组成一等渠道的注册链路。
- `relay/channel/xai/adaptor.go` 展示了复用 OpenAI Responses 解析、仅改供应商路由和能力分支的模式。
- `relay/channel/ali/image.go` 展示了把上游异步图片任务等待为 OpenAI 图片响应，以及按 `response_format=b64_json` 下载结果的模式。
- `relay/channel/task/sora/adaptor.go`、`relay/channel/adapter.go` 和 `service/task_polling.go` 提供视频任务提交、轮询、状态归一化和终态结算模式。
- `service/task_billing.go` 已具备异步任务退款和差额结算；`common/quota_math.go` 是额度换算的安全边界。
- FreeCanvas 的 `web/src/services/api/model-plugin.ts` 和 `web/src/services/api/video.ts` 已使用目标接口，不需要先发明新的浏览器协议。

### Institutional Learnings

- 当前仓库没有 `docs/solutions/` 或 `critical-patterns.md`。已有项目经验表明 KIE 需要专用适配器，不能只替换 OpenAI Base URL；正式实现前仍需按 KIE 官方文档和实际账号复核模型与返回字段。

### External References

- KIE GPT Image 2 文生图与图生图：`https://docs.kie.ai/cn/market/gpt/gpt-image-2-text-to-image`、`https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image`
- KIE Grok Imagine Video 1.5：`https://docs.kie.ai/market/grok-imagine/1-5-preview`
- KIE 统一任务查询：`https://docs.kie.ai/cn/market/common/get-task-detail`
- KIE Base64 文件上传：`https://docs.kie.ai/cn/file-upload-api/upload-file-base-64`
- KIE Terms of Use：`https://kie.ai/terms-of-use`

## Key Technical Decisions

- **使用一等 KIE 渠道类型，而不是 Advanced Custom 配置：** 文本可以简单改路由，但图片和视频需要任务提交、文件上传、状态转换和退款语义，单纯透传不能覆盖。
- **对外保留 FreeCanvas 媒体模型别名：** `gpt-image-2` 根据是否有参考图选择 KIE 文生图或图生图模型，`grok-imagine-video` 映射到 `grok-imagine-video-1-5-preview`。
- **首版采用轮询：** New API 已有异步任务轮询和幂等终态结算；新增回调会引入公网端点、签名校验和重放保护，不符合本次轻量范围。轮询遵守 KIE 每 Key 查询上限并响应请求取消。
- **图片保持同步兼容，视频保持异步：** FreeCanvas 当前图片调用期待一次返回图片数组，因此 New API 内部等待 KIE 图片任务；视频直接复用现有任务表和查询接口。
- **用户价与供应商成本分离：** 预扣、补扣和退款均走 New API 现有模型定价；`creditsConsumed` 不参与用户额度计算，也不进入面向用户的任务数据。

## Open Questions

### Resolved During Planning

- **是否需要新增独立业务后端：** 不需要；New API 已覆盖本次所需的账户、令牌、余额、路由和任务计费边界。
- **KIE 适配代码能否公开：** 可以；仓库只提交协议适配，不提交生产 Key。
- **FreeCanvas 首版是否需要改请求协议：** 不需要；目标路径与现有调用面已对齐。

### Deferred to Implementation

- **KIE 当前模型允许的全部比例、分辨率和时长枚举：** 实现时按当日官方 schema 与一个最小真实请求复核，适配器只接受确认过的值并为不支持值返回 400。
- **图片内部等待的最终超时值：** 首版建议 5 分钟，并跟随请求取消；若真实生成耗时经常超过该值，再升级为可恢复的异步图片任务，而不是无限延长 HTTP 请求。
- **服务器生产拓扑：** 数据库、Redis、反向代理和备份方案由部署环境确定，但不改变渠道适配接口。

## Implementation Units

- [x] **Unit 1: 注册 KIE 渠道并保留可选 Responses 能力（历史完成）**

**Goal:** 管理员可创建 KIE 渠道；已经实现的 `gpt-5.5` Responses 适配保留为后端可选能力，但不加入 FreeCanvas 官方渠道模型列表。

**Requirements:** 历史实现；当前官方渠道的 R2、R3 仅覆盖图片与视频。

**Dependencies:** 无

**Files:**
- Create: `relay/channel/kie/adaptor.go`
- Create: `relay/channel/kie/constants.go`
- Create: `relay/channel/kie/adaptor_test.go`
- Modify: `constant/channel.go`
- Modify: `constant/api_type.go`
- Modify: `common/api_type.go`
- Modify: `relay/relay_adaptor.go`
- Modify/Test: `controller/channel_test_internal_test.go`
- Modify: `web/src/features/channels/constants.ts`
- Modify: `web/src/features/channels/lib/channel-type-config.ts`
- Modify: `web/src/features/channels/lib/channel-utils.ts`
- Modify: `web/src/i18n/locales/en.json`
- Modify: `web/src/i18n/locales/fr.json`
- Modify: `web/src/i18n/locales/ja.json`
- Modify: `web/src/i18n/locales/ru.json`
- Modify: `web/src/i18n/locales/vi.json`
- Modify: `web/src/i18n/locales/zh-TW.json`
- Modify: `web/src/i18n/locales/zh.json`

**Approach:**
- 在 `Dummy` 计数项之前增加稳定的 KIE ChannelType 和 APIType，默认 Base URL 为 `https://api.kie.ai`。
- KIE adaptor 对 `/v1/responses` 改写为 `/codex/v1/responses`，请求和响应解析复用现有 OpenAI Responses 能力；首版不声明 `/responses/compact` 支持。
- 管理页只新增渠道名称、图标、默认地址和 Key 提示；KIE Key 只写入 Channel 配置，不进入前端构建变量、响应或普通日志。

**Patterns to follow:**
- `relay/channel/xai/adaptor.go`
- `controller/channel_test_internal_test.go`
- `web/src/features/channels/lib/channel-type-config.ts`

**Test scenarios:**
- Happy path：以 `gpt-5.5` 调用非流式 Responses，确认上游路径和模型分别为 `/codex/v1/responses`、`gpt-5-5`，返回 OpenAI Responses 结构。
- Happy path：流式请求保持 SSE 事件和 usage 解析，不向客户端暴露 KIE Key。
- Error path：KIE 返回 401、429 或 5xx 时，New API 产生对应稳定错误并保留渠道重试语义。
- Edge case：对 KIE 未支持的 relay mode 明确返回 unsupported，不把请求误发到 `/v1/chat/completions`。
- Integration：渠道类型、API 类型、默认 Base URL、适配器和管理端选项的注册结果一致。

**Verification:**
- 管理员可保存和测试 KIE 渠道；若管理员自行发布文本模型，客户端文本请求仍只携带 New API 用户令牌，不接触 KIE 密钥。

- [x] **Unit 2: 适配图片生成与编辑**

**Goal:** 保持 FreeCanvas 现有图片接口不变，内部完成 KIE 文件上传、任务轮询和 OpenAI 图片响应归一化。

**Requirements:** R1, R2, R3, R5

**Dependencies:** Unit 1

**Files:**
- Create: `relay/channel/kie/client.go`
- Create: `relay/channel/kie/dto.go`
- Create: `relay/channel/kie/image.go`
- Create/Test: `relay/channel/kie/client_test.go`
- Create/Test: `relay/channel/kie/image_test.go`
- Modify: `relay/channel/kie/adaptor.go`

**Approach:**
- `/v1/images/generations` 使用 `gpt-image-2-text-to-image`；`/v1/images/edits` 把 multipart 参考图转为 data URL，上传到 KIE 临时文件服务后使用 `gpt-image-2-image-to-image`。
- 把 Bearer 请求、临时文件上传、任务创建、任务查询和每 Key 限速集中在 KIE client；图片与视频共享这一供应商边界，避免两套错误解析和限流实现。
- 校验图片数量、MIME 和大小后再上传；小图使用 Base64 上传，禁止把用户提供的文件名直接作为可覆盖的稳定对象名。
- 任务创建后按 KIE 推荐区间轮询 `recordInfo`，支持请求取消、总超时和每 Key 查询限速；`success` 解析 `resultJson.resultUrls`，`fail` 保留 `failCode/failMsg` 作为内部诊断。
- KIE 响应只按白名单字段解析；错误日志记录状态码、任务 ID、failCode 和脱敏 failMsg，不记录可能含提示词或素材地址的完整 `param`/原始响应。
- 客户端请求 `b64_json` 时，立即下载 KIE 临时结果并返回 Base64，避免画布持久化一个会过期的供应商 URL。

**Patterns to follow:**
- `relay/channel/ali/image.go`
- `relay/channel/ali/dto.go`
- `service/file_service.go`

**Test scenarios:**
- Happy path：纯提示词创建文生图任务，轮询成功后返回 `data[].b64_json`。
- Happy path：multipart 多参考图先完成临时上传，再把返回 URL 放入图生图 `input_urls`。
- Edge case：`n`、图片数量、文件大小、MIME 或比例超出确认范围时，在调用 KIE 前返回 400。
- Error path：上传失败、创建任务失败、`fail` 状态、无效 `resultJson`、结果下载失败和超时均产生可读错误，并停止继续轮询。
- Integration：请求取消会终止上传/轮询；失败响应进入现有同步 relay 的退款路径，KIE Key 和上游原始诊断不会返回浏览器。

**Verification:**
- FreeCanvas 的文生图和带参考图编辑均能直接保存为本地可用图片；无需为 KIE 编写浏览器侧自定义脚本。

- [x] **Unit 3: 接入视频任务并闭合计费退款**

**Goal:** 复用 New API 异步任务体系完成 Grok Imagine 视频提交、查询、结果返回与失败退款。

**Requirements:** R2, R3, R4, R5

**Dependencies:** Unit 1；可复用 Unit 2 的 KIE 文件上传逻辑

**Files:**
- Create: `relay/channel/task/kie/adaptor.go`
- Create: `relay/channel/task/kie/dto.go`
- Create/Test: `relay/channel/task/kie/adaptor_test.go`
- Modify: `relay/relay_adaptor.go`
- Modify: `service/task_polling.go`
- Modify/Test: `service/task_polling_test.go`
- Modify/Test: `service/task_billing_test.go`

**Approach:**
- 把 FreeCanvas multipart 的 `prompt`、`seconds`、`size`、`resolution_name` 和参考图映射到 KIE `grok-imagine-video-1-5-preview` 的 `input`。
- 提交成功后只向用户返回 New API 公共 `task_...` ID；KIE 真实 taskId 留在现有 PrivateData。
- 将 `waiting/queuing/generating/success/fail` 映射到 New API 任务状态，成功只公开结果 URL，失败触发现有 CAS 保护的单次退款。
- 预扣使用 New API 管理员配置的模型价、时长和分辨率倍率；`creditsConsumed` 从用户可见任务数据和普通日志中剥离，不参与 `AdjustBillingOnComplete`。
- KIE 轮询响应必须先脱敏再进入 debug 日志和 Task Data，避免现有通用轮询器在清洗前打印真实 taskId、成本或请求参数。
- 所有时长和倍率在计费前执行上限校验，额度换算继续使用项目现有安全函数。

**Patterns to follow:**
- `relay/channel/task/sora/adaptor.go`
- `relay/channel/task/ali/adaptor.go`
- `service/task_polling.go`
- `service/task_billing.go`

**Test scenarios:**
- Happy path：文生视频与带参考图视频均创建公共任务 ID，轮询成功后 `/v1/videos/:task_id` 返回 completed 和可下载 URL。
- Edge case：缺少 prompt、非法时长、未知分辨率、过多参考图或空 taskId 在上游调用前失败。
- Error path：KIE 429 保持任务为非终态等待后续轮询；`fail`、404 和永久解析错误进入失败终态并给出可读原因。
- Billing：成功保持配置价格；失败退回全部预扣；同一失败终态被重复处理时退款和日志均只发生一次。
- Security：公共任务响应、任务 Data 和日志不包含 KIE Key、真实 taskId 或 `creditsConsumed`。

**Verification:**
- FreeCanvas 可创建并轮询视频任务；余额变化、失败退款和任务状态在 New API 中一致且可审计。

- [ ] **Unit 4: 写接入说明并执行最小上线验收**

**Goal:** 让部署和 FreeCanvas 配置步骤可重复，明确何时才算可开放给用户。

**Requirements:** R1, R4, R6

**Dependencies:** Unit 1-3

**Files:**
- Create: `docs/channel/kie.md`
- Modify: `dsh-freecanvas/web/src/stores/use-config-store.ts`
- Verify only, no expected edit: `dsh-freecanvas/web/src/services/api/model-plugin.ts`
- Verify only, no expected edit: `dsh-freecanvas/web/src/services/api/video.ts`

**Approach:**
- 文档说明 KIE 渠道创建、两项媒体模型映射、New API 用户令牌签发、定价、限流、Key 轮换和失败排查。
- 部署时在 New API 后台录入 KIE Key；FreeCanvas 只配置部署后的 New API Base URL、用户令牌和两个公开媒体模型名。
- 音频能力继续指向其他渠道或在界面中明确不可用，不能把 KIE 首版渠道误标为全能力渠道。
- 面向用户的说明必须披露提示词和参考素材会发送给 KIE，并在付费开放前确认 KIE 对转售/白标用途的书面许可或明确条款依据。
- 开放用户前依次验证 `/v1/models`、文生图、图生图、视频创建/轮询及一次可控失败退款，并核对 New API 与 KIE 两边的成本记录。

**Test scenarios:**
- Integration：同一 New API 用户令牌能调用图片和视频能力，KIE Key 从未出现在 FreeCanvas 终端用户的浏览器网络记录中。
- Billing：余额不足会在请求到达 KIE 前拒绝；KIE 失败后用户余额恢复且不会因再次查询而变化。
- Operational：KIE Key 失效、余额不足和 429 均能从管理员日志区分，用户只看到安全、可操作的错误信息。

**Verification:**
- 只有在真实 KIE 账号完成图片、视频成功请求和一次失败退款，并确认商业使用边界后，渠道状态才从内部测试切换为对用户可用。

**当前内部验收证据：**
- 官方渠道模型列表已收敛为 `gpt-image-2` 与 `grok-imagine-video`；管理后台内置渠道测试器不支持 `/v1/videos`，因此视频验收必须走真实客户端接口。
- `gpt-image-2` 已通过 `/v1/images/generations` 返回成功结果；`grok-imagine-video` 已通过 `/v1/videos` 创建任务、轮询到 `completed`，并从内容接口下载到约 1.26 MB 的标准 MP4。
- 视频模型临时基础价为 `$0.01/请求`，6 秒 720p 测试按当前时长与分辨率倍率实际扣除 `$0.09`；这只是内部连通性价格，不代表正式售价。
- 测试使用的限额、单模型、一天有效客户端令牌已删除，本地临时认证文件和视频文件已清理；失败退款、正式毛利价格、日志脱敏复核与 KIE 商业授权仍是开放用户前的阻断项。

## System-Wide Impact

- **Interaction graph:** FreeCanvas → New API TokenAuth/Distribute → KIE adaptor → KIE；图片在请求内等待，视频进入 New API Task 表并由轮询器更新。
- **Error propagation:** KIE HTTP 错误和业务 `fail` 先归一化为 New API 错误/任务状态，再由现有浏览器错误处理展示；上游原始响应只保留必要的管理员诊断。
- **State lifecycle risks:** 图片任务在 HTTP 超时后仍可能在 KIE 继续执行；视频依靠公共 taskId、PrivateData 上游 ID 和 CAS 终态更新避免重复退款。
- **API surface parity:** FreeCanvas 现有图片和视频接口保持不变；文本与音频由 DSH 或用户配置的其他渠道承担。
- **Integration coverage:** 单元测试不能证明真实模型、临时文件 URL、代理超时和 KIE 账号计费，必须保留带真实 Key 的上线验收。
- **Unchanged invariants:** 不改变 New API 用户令牌、余额来源、支付流程、数据库兼容性或 FreeCanvas 本地画布存储方式。

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| New API 当前 Channel Key 存于数据库，若数据库或备份泄露会暴露 KIE Key | 限制数据库和备份访问、启用磁盘/备份加密、给 KIE Key 配置 IP 白名单与消费上限并建立轮换流程；应用层字段加密作为后续独立安全任务 |
| 图片同步等待期间连接中断，但 KIE 任务继续产生成本 | 使用请求取消与明确总超时，在管理员日志保留上游 taskId；先限制并发和单用户额度，若成本泄漏可见再升级为可恢复异步图片任务 |
| KIE 临时输入或结果 URL 过期导致画布内容失效 | 图片在 `b64_json` 模式立即转存为 Base64；视频由 FreeCanvas 现有本地文件存储流程尽快下载 |
| 轮询超过 KIE 每 Key 10 次/秒限制 | 视频复用现有按渠道轮询节奏；图片增加每 Key 查询限速，间隔保持在官方建议范围，并对 429 退避 |
| 上游模型名或字段变化 | 仅开放两个已验证媒体模型；部署前按官方 schema 和真实账号做最小请求，更新映射后再启用渠道 |
| 用户售价与 KIE 成本混淆造成亏损 | New API 定价是唯一用户扣费真相；KIE credits 仅供管理员核账，开放前配置毛利和单用户额度上限 |
| KIE 当前公开条款未明确授予 API 转售、代充或白标权利 | 适配与内部测试可以先做；向第三方收费前联系 KIE 取得书面确认，并保存当时生效的条款版本。此项需要运营/法律判断，不以代码验收替代 |
| 用户提示词、参考素材和生成任务跨越到第三方 KIE | 在用户协议和隐私说明中披露第三方处理，限制敏感素材，确认 KIE 的留存与删除规则，并仅传递完成生成所必需的数据 |
| KIE 账户余额不足导致官方渠道整体中断 | 使用 KIE 余额/日志页建立低余额检查与告警；内部测试期设置 Key 的小时、日和总消费上限，确认充值后再扩大用户范围 |

## Documentation / Operational Notes

- New API 仍受其现有 AGPL 和署名要求约束；本计划不修改或移除上游项目标识。
- 生产 Key 只能通过部署后的管理员界面或受控运行时配置录入，禁止写入仓库、镜像、前端变量、截图和测试夹具。
- 首版建议仅给内部测试账号开放；真实支付、自动充值和商业套餐在生成链路稳定后另行设计。

## Sources & References

- Target repository: `https://github.com/JustinQiuck/new-api`
- Existing gateway patterns: `constant/channel.go`, `relay/relay_adaptor.go`, `relay/channel/ali/image.go`, `relay/channel/task/sora/adaptor.go`, `service/task_polling.go`, `service/task_billing.go`
- Existing FreeCanvas calls: `web/src/services/api/model-plugin.ts`, `web/src/services/api/video.ts`, `web/src/stores/use-config-store.ts`
- KIE official docs: `https://docs.kie.ai/cn`
- KIE public terms: `https://kie.ai/terms-of-use`
