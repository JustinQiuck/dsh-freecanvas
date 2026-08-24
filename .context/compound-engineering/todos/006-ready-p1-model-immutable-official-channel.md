---
status: ready
priority: p1
issue_id: "006"
tags: [freecanvas, zustand, channel, api]
dependencies: ["005"]
---

# 建模不可变官方渠道并统一生成检查

## Problem Statement

当前所有 `ModelChannel` 都可编辑、删除、持久化和导出，并统一要求浏览器 API Key。官方渠道需要成为代码派生的唯一渠道，同时所有图片/视频入口都必须走一致的账户连接判断。

## Findings

- `web/src/stores/use-config-store.ts` 没有 `official/custom` 类型。
- `web/src/services/config-file.ts` 导出完整 AI 配置。
- `isAiConfigReady` 在画布、图片页、视频页和插件宿主 hook 中重复调用。
- 官方两个模型没有自定义 script，应使用标准图片/视频 API，经同源代理调用。

## Proposed Solutions

### Option 1: 代码派生渠道 + 统一 generation access hook（采用）

**Approach:** normalize 时重建唯一官方渠道；官方状态由独立 store 查询宿主；各生成入口复用一个访问检查 hook。

**Pros:** 无法通过导入篡改；所有入口一致；自定义渠道保持原行为。

**Cons:** 需要谨慎修改配置规范化和多处调用点。

**Effort:** 2-3 天

**Risk:** High

### Option 2: 保留普通渠道但隐藏按钮

**Approach:** 只在 UI 隐藏官方渠道编辑/删除按钮。

**Pros:** 改动少。

**Cons:** 配置导入、store API 或旧数据仍可篡改；安全属性依赖 UI。

**Effort:** 0.5 天

**Risk:** High

## Recommended Action

采用 Option 1。官方渠道从持久化和导入数据中剔除后重新生成；官方请求不附加浏览器 Authorization，自定义 BYOK 请求保持现有行为。

## Technical Details

**Affected files:**
- `web/src/stores/use-config-store.ts`
- `web/src/stores/use-official-account-store.ts`（新增）
- `web/src/services/api/official-account.ts`（新增）
- `web/src/hooks/use-generation-access.ts`（新增）
- `web/src/services/config-file.ts`
- `web/src/components/layout/client-root-init.tsx`
- `web/src/services/api/image.ts`
- `web/src/services/api/video.ts`
- `web/src/pages/canvas/project.tsx`
- `web/src/pages/canvas/hooks/use-plugin-host.tsx`
- `web/src/pages/image/index.tsx`
- `web/src/pages/video/index.tsx`
- `web/package.json`
- `web/src/stores/use-config-store.test.ts`（新增）
- `web/src/services/api/official-account.test.ts`（新增）

## Resources

- Master plan Unit 5: `docs/plans/2026-08-23-001-feat-official-channel-redemption-plan.md`
- Current config store: `web/src/stores/use-config-store.ts`

## Acceptance Criteria

- [ ] `ModelChannel.kind` 明确区分 `official` 与 `custom`。
- [ ] 稳定 `OFFICIAL_CHANNEL_ID`、固定 Base URL 和固定两个模型由代码工厂生成。
- [ ] 空配置、旧配置、重复项、伪造 ID 和恶意导入最终都只有一个官方渠道。
- [ ] 官方渠道数据和账户状态不进入配置导出或 WebDAV。
- [ ] 自定义渠道增删改、导入导出和默认模型选择不回归。
- [ ] 官方请求固定命中 `/dsh-freecanvas/official-api`，浏览器不附加 Authorization。
- [ ] 自定义请求继续使用用户配置的 Base URL 和 API Key。
- [ ] `useOfficialAccountStore` 只保存脱敏状态和最后刷新时间，不持久化 Token。
- [ ] `useGenerationAccess` 覆盖画布、图片页、视频页和插件宿主 hook 的全部生成入口。
- [ ] 官方未连接时打开账户抽屉；自定义渠道未配置时仍打开渠道配置。
- [ ] 图片完成、视频终态和兑换成功后刷新余额；刷新失败不破坏生成结果。
- [ ] 配置规范化、导入对抗、官方请求头和 stale 余额测试已编写。
- [ ] 验收者已运行前端 test/typecheck 并记录结果。

## Work Log

### 2026-08-23 - 不可变渠道与统一访问检查已实现，待验收

**By:** Codex

**Actions:**
- 配置 normalize 现在会丢弃持久化或导入数据中的伪造官方渠道，并重新生成唯一、固定模型和同源 Base URL 的官方生图/视频渠道；自定义渠道继续按原数据保存。
- 配置导出会剔除官方渠道和官方模型选择，导入会经过同一 normalize；官方请求不会附加浏览器 API Key，自定义 BYOK 请求保持原有 Authorization 行为。
- 新增仅保存脱敏状态的官方账户 store 与统一生成前检查：官方未连接时打开账户抽屉，缺少自定义渠道配置时仍打开设置。
- DSH Web typecheck 只剩未改动的 `canvas-generation-helpers.ts` 空 metadata 既有错误；本轮官方渠道文件未产生 TypeScript 错误。人工回归和宿主联调尚未进行；官方总开关保持关闭，TODO 仍为 `ready`。

**Learnings:**
- `points` 已是服务端按账本换算后的十进制展示值；前端必须按字符串格式化，不能再除以 `points_scale` 或用 JavaScript `Number` 二次换算。

### 2026-08-23 - Todo 创建

**By:** Codex

**Actions:**
- 将配置数据模型、官方账户状态和所有生成前置检查合并为一个原子改造项。

**Learnings:**
- 隐藏 UI 按钮不是不可变配置；必须在 normalize、persist 和 import 三个边界同时执行。

## Notes

- 官方渠道只覆盖图片和视频；文本与音频继续使用其他渠道。
