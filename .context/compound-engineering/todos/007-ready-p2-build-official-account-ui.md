---
status: ready
priority: p2
issue_id: "007"
tags: [freecanvas, frontend, wallet, ux]
dependencies: ["004", "006"]
---

# 实现官方渠道卡片、点数入口与账户抽屉

## Problem Statement

后端和状态层完成后，用户仍需要自然完成连接、查看点数、购买卡密、兑换和断开；官方渠道必须明显区别于可编辑的 BYOK 渠道，又不能在画布顶栏造成遮挡。

## Findings

- `UserStatusActions` 同时用于主导航和画布顶栏，适合作为统一账户入口。
- `app-config-modal.tsx` 当前为每个渠道渲染编辑和删除按钮。
- 画布 UI 规范要求顶部控件扁平、无阴影、低视觉重量，并覆盖深浅主题。

## Proposed Solutions

### Option 1: 共用扁平点数入口 + 账户抽屉（采用）

**Approach:** 在 `UserStatusActions` 增加响应式点数入口，官方渠道卡片只显示账户动作，所有钱包状态放入一个 Drawer。

**Pros:** 主导航和画布一致；不占画布主体；状态集中。

**Cons:** 需要处理较多账户和网络状态。

**Effort:** 1-2 天

**Risk:** Medium

### Option 2: 把充值控件塞进渠道编辑器

**Approach:** 继续使用 ChannelEditorDrawer。

**Pros:** 少一个新组件。

**Cons:** 官方渠道没有可编辑配置；账户和 BYOK 概念混淆；顶栏余额无入口。

**Effort:** 1 天

**Risk:** Medium

## Recommended Action

采用 Option 1。保持极简扁平视觉；窄窗口隐藏长余额文本但保留可访问入口；Drawer 覆盖完整状态和安全提示。

## Technical Details

**Affected files:**
- `web/src/components/layout/official-account-drawer.tsx`（新增）
- `web/src/components/layout/app-config-modal.tsx`
- `web/src/components/layout/user-status-actions.tsx`
- `web/src/components/canvas/canvas-top-bar.tsx`（仅布局确需时）
- `web/src/i18n/locales/zh-CN.ts`
- `web/src/i18n/locales/en-US.ts`

## Resources

- Master plan Unit 6 and User Flows: `docs/plans/2026-08-23-001-feat-official-channel-redemption-plan.md`
- Canvas UI rules: `AGENTS.md`

## Acceptance Criteria

- [ ] 官方渠道卡片固定置顶并显示“官方”“图片 + 视频”和连接状态。
- [ ] 官方渠道 DOM 中不存在编辑和删除操作，自定义渠道仍可编辑删除。
- [ ] `UserStatusActions` 在主导航和画布顶栏显示“未连接 / N 点”。
- [ ] 点数入口保持无阴影、无胶囊填充、轻 hover 的扁平样式。
- [ ] 窄窗口、长余额和画布顶栏不会遮挡现有按钮。
- [ ] Drawer 覆盖未开放、未连接、连接中、已连接、stale、余额不足、Token 过期和离线状态。
- [ ] 用户可以打开账户门户、粘贴配对码、购买卡密、兑换、刷新和断开。
- [ ] `TopUpLink` 缺失或非 HTTPS 时不显示可点击购买按钮。
- [ ] 配对码和卡密不持久化，成功后立即清空。
- [ ] 重复提交被禁用；断开需要二次确认；焦点和键盘导航正确。
- [ ] 深色、浅色、中文和英文状态均通过人工验收。
- [ ] 余额刷新失败保留最后成功值并明确标注“可能有延迟”。

## Work Log

### 2026-08-23 - 账户抽屉与点数入口已实现，待验收

**By:** Codex

**Actions:**
- 官方渠道卡片固定显示连接状态且不提供编辑/删除；主导航与画布顶栏复用轻量点数入口，并在窄窗口仅保留可访问图标。
- 新增账户 Drawer，覆盖未开放、未连接、加载、过期、离线与 stale 状态；支持打开已校验的账户门户、配对、刷新、卡密兑换、购买链接和二次确认断开。
- 配对码与卡密只保留在组件内存，成功后清空；失败后的刷新优先恢复最新公开状态，避免盲目重复兑换。
- 点数使用字符串/BigInt 格式化，最多显示两位小数，不会因浏览器浮点数或 `points_scale` 造成二次换算和精度损失。
- DSH Web typecheck 只剩未改动的 `canvas-generation-helpers.ts` 空 metadata 既有错误；尚未进行深浅主题、双语、窄画布顶栏和真实宿主代理的人工验收，官方总开关保持关闭。

**Learnings:**
- 账户状态和支付入口必须与 BYOK 编辑器分离，避免把受限设备凭据误解为可导出的 API Key。

### 2026-08-23 - Todo 创建

**By:** Codex

**Actions:**
- 把官方渠道展示、全局点数入口和钱包交互合成一个用户可验收切片。

**Learnings:**
- 账户入口应复用 `UserStatusActions`，避免再次在顶栏叠加遮挡画布的浮层按钮。

## Notes

- 功能实现后先进入 `pending-test.mdx`，用户确认前不要写成正式已发布功能。
