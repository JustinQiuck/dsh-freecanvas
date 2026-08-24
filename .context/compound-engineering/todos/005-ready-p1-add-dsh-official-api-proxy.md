---
status: ready
priority: p1
issue_id: "005"
tags: [dsh-plugin, proxy, credentials, security]
dependencies: ["001", "002", "003"]
---

# 实现 DSH 官方凭据保险箱与固定代理

## Problem Statement

浏览器不能持有官方设备 Token，但 FreeCanvas 又需要访问 New API 的账户、兑换和媒体接口。需要在 DSH 插件宿主建立本地凭据存储和最小白名单代理。

## Findings

- `plugins/dsh-freecanvas/lib/index.js` 已注入 `webServer` 并注册 `/dsh-freecanvas` 和 Agent bootstrap。
- 更具体的官方 API 前缀可能被通用画布 SPA fallback 吞掉，必须显式验证路由优先级。
- 插件宿主使用 Node 22+，可实现原子文件写入、Fetch 转发和流式响应。

## Proposed Solutions

### Option 1: DSH 宿主代持 + 固定白名单代理（采用）

**Approach:** Token 保存到权限受限文件，浏览器只访问同源固定路由；宿主剥离来访鉴权并注入设备 Token。

**Pros:** Token 不进浏览器；最小请求面；可断开和撤销。

**Cons:** 需要安全处理文件、流、路由和异常回滚。

**Effort:** 2-3 天

**Risk:** High

### Option 2: Token 存浏览器 localStorage

**Approach:** 前端直接调用 New API。

**Pros:** 宿主改动少。

**Cons:** Token 可被脚本、导出和调试工具读取，不满足商业安全边界。

**Effort:** 0.5 天

**Risk:** Critical

## Recommended Action

采用 Option 1。严格按主计划路由白名单、CSRF、HTTPS、文件权限、流式传输和断开回滚要求实现，不建设通用反向代理。

## Technical Details

**Affected files:**
- `plugins/dsh-freecanvas/lib/official-account-store.js`（新增）
- `plugins/dsh-freecanvas/lib/official-api-proxy.js`（新增）
- `plugins/dsh-freecanvas/lib/index.js`
- `plugins/dsh-freecanvas/package.json`
- `plugins/dsh-freecanvas/test/official-account-store.test.js`（新增）
- `plugins/dsh-freecanvas/test/official-api-proxy.test.js`（新增）

**Credential file:**
- `~/.infinite-canvas/official-account.json`
- Directory mode `0700`; file mode `0600`; atomic replacement.

**Browser prefix:**
- `/dsh-freecanvas/official-api`

## Resources

- Master plan Unit 4 and route allowlist: `docs/plans/2026-08-23-001-feat-official-channel-redemption-plan.md`
- Existing host route pattern: `plugins/dsh-freecanvas/lib/index.js`

## Acceptance Criteria

- [ ] 凭据文件 schema、目录权限、文件权限和原子替换均有测试。
- [ ] 损坏文件拒绝覆盖并要求重新配对，不静默清空或修复。
- [ ] 配对成功时宿主截获并保存 `access_token`，浏览器响应中不存在 Token。
- [ ] 保存失败会尝试撤销刚创建的远端 Token，避免孤儿凭据。
- [ ] `OFFICIAL_API_PREFIX` 在通用 `/dsh-freecanvas` 路由前生效，测试证明不会落入 SPA fallback。
- [ ] `/status` 只返回开关、连接状态、公开钱包 URL 和过期时间。
- [ ] 代理只允许计划列出的 method/path/model，不接受完整 URL、路径穿越或任意 query 鉴权。
- [ ] 请求体上限、连接/读取超时、媒体流式传输和并发限制已实现。
- [ ] 浏览器 Authorization、Cookie、Host、Forwarded 和 hop-by-hop headers 被丢弃。
- [ ] `Sec-Fetch-Site` 和 Origin 校验阻止跨站配对、兑换或断开。
- [ ] 生产上游只允许 HTTPS；非 loopback/共享 DSH fail closed。
- [ ] 断开时先远端撤销再删除；远端失败时本地凭据进入 disabled 状态且不能继续调用。
- [ ] Token 不进入配置导出、WebDAV、支持包、浏览器响应或日志。
- [ ] 验收者已运行两个 Node host test 文件并记录结果。

## Work Log

### 2026-08-23 - Todo 创建

**By:** Codex

**Actions:**
- 固化代理白名单、路由优先级和本地凭据生命周期。

**Learnings:**
- `/dsh-freecanvas` 是通用前缀，官方 API 必须使用更具体前缀并验证注册优先级。

### 2026-08-23 - 宿主代理实现待验收

**By:** Codex

**Actions:**
- 新增本机 `official-account.json` 保险箱：严格 schema、损坏文件拒绝覆盖、原子替换、`0700` 目录和 `0600` 文件权限。
- 新增 `/dsh-freecanvas/official-api` 固定白名单代理，并在通用画布前缀前注册；只允许配对、账户、兑换、断开与两个既定媒体模型的固定路径。
- 浏览器来访鉴权与转发头不会透传；代理只注入宿主 Token，强制本机同源、变更请求 Origin、请求体上限、60 秒读取超时和媒体并发上限。
- 远端撤销失败时本地凭据会改名隔离；新增 `test:host` 与两份 Node host 测试文件。
- 补充存储失败后的远端撤销与媒体安全流式转发测试；服务地址仅接受根路径，避免配置路径与实际固定上游路径不一致。

**Remaining:**
- Node host 测试已通过；仍未进行打包测试、Desktop 路由验收或任何真实 New API/KIE 请求，TODO、部署和官方开关继续保持 `ready`/关闭。

### 2026-08-23 - 本地宿主回归通过

**By:** Codex

**Evidence:**
- `npm run test:host`：15/15 通过，覆盖原子权限、损坏文件保护、路由优先级、令牌剥离、失败撤销隔离、跨站拒绝、固定模型白名单和安全媒体流。

## Notes

- 本机管理员或同一 OS 用户下的恶意进程不在 `0600` 文件模型可防御范围内；依靠短期 Token 和远端撤销缩小风险。
