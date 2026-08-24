---
status: ready
priority: p2
issue_id: "004"
tags: [new-api, wallet, frontend, operations]
dependencies: ["002", "003"]
---

# 在 New API 钱包增加 FreeCanvas 配对入口

## Problem Statement

一次性配对接口完成后，用户仍需要一个受信任页面生成、复制和理解配对码；运营也需要清楚的卡密批次、购买入口和售后说明。

## Findings

- New API 已有 Wallet 页面、卡密兑换 UI 和 `TopUpLink`。
- 用户应在已登录的 New API 页面生成代码，FreeCanvas 不应收集用户名/密码。
- 配对码不能进入 localStorage/sessionStorage 或历史列表。

## Proposed Solutions

### Option 1: Wallet 内嵌 FreeCanvas 配对卡片（采用）

**Approach:** 在现有 Wallet 页面增加按需签发、倒计时、复制和过期状态。

**Pros:** 复用登录会话与现有钱包认知；无需独立站点。

**Cons:** 需要补充钱包 UI 和多语言文案。

**Effort:** 0.5-1 天

**Risk:** Low

### Option 2: 管理员手工发 Token

**Approach:** 运营逐个创建 Token 并发给用户。

**Pros:** 无钱包开发。

**Cons:** 不可扩展；长期凭据暴露；售后和撤销成本高。

**Effort:** 持续人工成本

**Risk:** High

## Recommended Action

采用 Option 1。配对码只在用户主动点击后生成，展示 5 分钟倒计时和一次性警告；页面刷新后不恢复明文代码。

## Technical Details

**Affected files in New API:**
- `web/src/features/wallet/api.ts`
- `web/src/features/wallet/types.ts`
- `web/src/features/wallet/components/freecanvas-pairing-card.tsx`（新增）
- `web/src/features/wallet/index.tsx`
- `web/src/i18n/locales/zh.json`
- `web/src/i18n/locales/en.json`
- 其他随发行 locale JSON（英文回退）
- `docs/freecanvas-operations.md`

## Resources

- Master plan Unit 3: `docs/plans/2026-08-23-001-feat-official-channel-redemption-plan.md`
- Existing wallet feature: New API `web/src/features/wallet/`

## Acceptance Criteria

- [ ] Wallet 页面存在“连接 DSH FreeCanvas”卡片。
- [ ] 未登录、管理 API Key 或非浏览器会话不能签发配对码。
- [ ] 仅用户主动点击后生成代码，显示有效期和倒计时。
- [ ] 复制成功、复制失败、加载、限流、过期和重新生成状态均有反馈。
- [ ] 配对码不写入 localStorage、sessionStorage、URL、日志或历史记录。
- [ ] 页面刷新后不会恢复旧明文配对码。
- [ ] 运维文档说明卡密面值、点数比例、购买入口、售后和急停。
- [ ] 用户说明披露图片/视频内容会发送给 KIE，points 不等同于 KIE credits。
- [ ] 中文文案完成，其他发行语言至少有安全的英文回退。

## Work Log

### 2026-08-23 - 钱包入口与运维说明已实现，待验证

**By:** Codex

**Actions:**
- 在 New API 的 Wallet 中新增“连接 DSH FreeCanvas”卡片；仅在用户点击后创建配对码，页面内显示倒计时、复制、过期、重新生成和创建失败反馈。
- 配对码仅保存在 React 内存状态，不写入 localStorage、sessionStorage、URL 或历史；过期时会立即清除明文。
- 新增中文文案和其他发行语言的英文回退，并在用户界面与 `docs/freecanvas-operations.md` 披露 KIE 第三方处理、points 账本边界、卡密购买入口、售后、急停及付费开放验收条件。
- 增加钱包配对组件自动化用例；该用例与 New API Web typecheck 已通过，未推送、未部署，官方渠道保持关闭。

**Evidence:**
- `npm test -- --run src/features/wallet/components/__tests__/freecanvas-pairing-card.test.tsx`：2/2 通过。
- `npm run typecheck`（New API Web）：通过。

**Learnings:**
- 钱包配对入口只能使用浏览器会话签发的短时码；设备令牌和 KIE 密钥均不进入浏览器状态。

### 2026-08-23 - Todo 创建

**By:** Codex

**Actions:**
- 将用户配对入口与运营说明从 API 工作中独立出来。

**Learnings:**
- 生成配对码必须依赖真实浏览器会话，不能退化为普通管理 API 调用。

## Notes

- 本 TODO 不实现支付网关或订单系统。
