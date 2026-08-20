# dsh-plugin-freecanvas

将 DSH FreeCanvas 嵌入 DeepSeek Harness，提供侧边栏入口、会话/分屏/画布三种布局，以及本地 Canvas Agent 自动连接。

## 功能

- 在 DSH 侧边栏增加「DSH FreeCanvas」入口。
- 通过同源代理把本地画布服务嵌入 DSH，避免 Electron 跨域 iframe 限制。
- 支持会话、分屏和全画布模式，并保存分屏比例。
- 使用随包安装的 `@basketikun/canvas-agent` 自动启动本地 Agent HTTP 服务，不在运行时临时下载脚本。
- 可配合 `@deepseek-ai/dsh-mcp-client` 将画布 MCP 工具注册给 DSH agent。

## 前置条件

先启动 DSH FreeCanvas，默认地址为 `http://127.0.0.1:3000`：

```bash
git clone https://github.com/JustinQiuck/dsh-freecanvas.git
cd dsh-freecanvas
docker compose -f docker-compose.local.yml up -d --build
```

也可以进入 `web/` 使用项目现有的本地开发命令。

## 安装

从仓库检出目录安装到 DSH Desktop profile：

```bash
dsh plugin --profile desktop add ./plugins/dsh-freecanvas
```

本包通过 `dsh.bundle.patch` 自动插入 `ui-dsh-freecanvas`，不要在 profile 的 `cordis.patch.yml` 中重复声明同一个 id。

## 配置

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `canvasUrl` | `http://127.0.0.1:3000` | DSH FreeCanvas 服务地址 |
| `autoStartAgent` | `true` | 随 DSH 自动启动本地 Canvas Agent HTTP 服务 |

可以在 DSH 设置的插件配置中修改，也可以在 profile 补丁中配置：

```yaml
- id: ui-dsh-freecanvas
  name: dsh-plugin-freecanvas
  config:
    canvasUrl: http://127.0.0.1:3000
    autoStartAgent: true
```

## Agent 操作画布

若需要让 DSH agent 直接读取和修改画布，请在同一 profile 中配置 `@deepseek-ai/dsh-mcp-client`，连接 Canvas Agent 的 MCP 入口：

```yaml
- id: mcp-dsh-freecanvas
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: freecanvas
    transport: stdio
    command: npx
    args: ['-y', '@basketikun/canvas-agent@0.6.0', 'mcp']
```

DSH FreeCanvas 基于 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) 集成与适配，感谢原作者及所有贡献者。

## License

[MIT](./LICENSE)
