# Changelog

## Unreleased

## 0.2.0

- 将 DSH FreeCanvas 作为带宿主端和 Web Client 的自包含 DSH bundle 发布。
- 内置画布静态资源、Canvas Agent 自动启动以及会话/分屏/全画布布局入口。
- 使用 DSH 宿主本地存储持久化画布、素材、媒体、生成记录和用户配置，避免 Desktop 动态端口变化导致数据丢失。
- 发布候选新增一次性 DSH profile 的安装、重复安装、启动与卸载自动验收。
- 增加插件专用 tag、版本和 Changelog 一致性校验，以及受保护 Environment 下的 npm 首发与 Trusted Publishing 流程。
- 增加默认关闭的官方媒体渠道宿主边界；KIE Key 不进入插件包或浏览器资源。
- 插件原创代码改用 Elastic License 2.0，并随包保留上游 MIT 声明。

## 0.1.0

- 初始 DSH 插件集成版本。
