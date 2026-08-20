<p align="center">
  <img src="web/public/logo.svg" width="96" alt="DSH FreeCanvas logo">
</p>

<h1 align="center">DSH FreeCanvas</h1>

<p align="center">
  <a href="https://github.com/JustinQiuck/dsh-freecanvas"><img src="https://img.shields.io/github/stars/JustinQiuck/dsh-freecanvas?style=flat-square&logo=github" alt="GitHub stars"></a>
  <a href="https://github.com/JustinQiuck/dsh-freecanvas/tags"><img src="https://img.shields.io/github/v/tag/JustinQiuck/dsh-freecanvas?style=flat-square&label=version" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-f97316?style=flat-square" alt="License"></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white" alt="Vite"></a>
</p>

<p align="center">
  <a href="docs/content/docs/overview/quick-start.mdx">快速开始</a> · <a href="docs/content/docs/overview/features.mdx">功能介绍</a> · <a href="docs/content/docs/overview/render.mdx">Render 部署</a> · <a href="docs/content/docs/overview/docker.mdx">Docker 部署</a> · <a href="docs/content/docs/canvas/canvas-node-manual.mdx">画布节点操作手册</a> · <a href="docs/content/docs/canvas/canvas-shortcuts.mdx">画布快捷键</a> · <a href="SECURITY.md">漏洞提交</a> · <a href="docs/content/docs/progress/todo.mdx">待办事项</a> · <a href="canvas-agent/README.md">本地 Canvas Agent</a> · <a href="plugins/infinite-canvas">Codex app 插件</a>
</p>

DSH FreeCanvas 是将开源项目 [infinite-canvas](https://github.com/basketikun/infinite-canvas) 集成到 DSH 的 AI 无限画布工作台。它把画布编排、AI 图片生成、参考图编辑、视频生成、对话助手、提示词库和素材管理放在同一个界面里，为 DSH 提供可视化的 AI 创作与内容编排能力。

## 项目信息

- **项目定位**：面向 DSH 的可视化 AI 创作与内容编排工作台。
- **当前状态**：基础集成已经完成，本仓库负责后续适配和维护。
- **Agent 能力**：通过本地 Canvas Agent 和 MCP 连接 Codex 或 Claude Code。
- **数据边界**：画布、素材、生成记录和 API Key 默认保存在浏览器本地。
- **接口方式**：浏览器直接请求用户配置的 OpenAI 兼容接口。
- **项目仓库**：[JustinQiuck/dsh-freecanvas](https://github.com/JustinQiuck/dsh-freecanvas)

## 致谢

本项目基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 进行集成与适配。衷心感谢原作者 [@basketikun](https://github.com/basketikun) 及所有源项目贡献者，感谢他们开放优秀的项目与持续投入。请关注并支持源项目。

> [!CAUTION]
> 项目仍在持续适配中，不保证历史数据格式长期兼容。升级前请备份重要画布数据。

## 核心功能

- 无限画布：多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出。
- AI 创作：浏览器前台直连你配置的 OpenAI 兼容接口，支持文生图、图生图、参考图编辑、文本问答、音频和视频生成。
- 画布助手：围绕选中节点和上游节点对话、生图，并把结果插回画布。
- 本地 Agent：通过本机 Canvas Agent 连接 Codex / Claude Code，让 Agent 通过 MCP 操作当前画布；
- Codex App 插件：提供 Codex app 插件，安装后会自动注册 MCP 并尝试拉起本地 Agent。
- 插件系统：支持通过 URL 动态安装 / 启用 / 更新 / 卸载远程节点插件，并提供 TypeScript SDK 自行开发画布节点插件。
- 自定义接口调用：可自定义生图 / 视频接口的调用方式，灵活适配各类中转站与自建服务。
- 提示词库：浏览器前端直连多个 GitHub 开源项目，并缓存到 IndexedDB。

完整功能说明见 [功能介绍](docs/content/docs/overview/features.mdx)。

## 快速开始

AI API Key、Base URL、画布、素材和生成记录默认保存在浏览器本地。

### 本地开发

```bash
git clone git@github.com:JustinQiuck/dsh-freecanvas.git
cd dsh-freecanvas
cd web
bun install
bun run dev
```

### Docker 运行

```bash
git clone git@github.com:JustinQiuck/dsh-freecanvas.git
cd dsh-freecanvas
docker compose -f docker-compose.local.yml up -d --build
```

运行后默认端口3000，可访问 `http://localhost:3000`。

首次打开后进入右上角配置，填入自己的 OpenAI 兼容 `Base URL` 和 `API Key`。

如果默认的OpenAI接口调用方式与您的API不同，可自定义生图/视频脚本调用。

## 效果展示

<table width="100%">
  <tr>
    <td width="50%"><img src="https://i.ibb.co/TDFvGWDT/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/zVwJq3YS/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/PvY3qhhK/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/7D04LwN/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/bj30FtS5/5.png" alt="5" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/hxRvjw51/image.png" alt="image" border="0"></td>
  </tr>
  <tr>
    <td width="50%"><img src="https://i.ibb.co/jkWsF8q1/image.png" alt="image" border="0"></td>
    <td width="50%"><img src="https://i.ibb.co/XrnfXHx7/image.png" alt="image" border="0"></td>
  </tr>
</table>

## 项目入口

- [项目仓库](https://github.com/JustinQiuck/dsh-freecanvas)
- [问题反馈](https://github.com/JustinQiuck/dsh-freecanvas/issues)
- [项目文档](docs/index.zh-CN.md)
- [更新日志](CHANGELOG.md)
- [安全策略](SECURITY.md)

## 开源协议

本项目使用 [MIT License](LICENSE)。任何人都可以免费使用、复制、修改、分发、再授权和商业使用本项目，也可以用于闭源产品。

## Star History

<a href="https://www.star-history.com/?repos=JustinQiuck%2Fdsh-freecanvas&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=JustinQiuck/dsh-freecanvas&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=JustinQiuck/dsh-freecanvas&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=JustinQiuck/dsh-freecanvas&type=date&legend=top-left" />
 </picture>
</a>
