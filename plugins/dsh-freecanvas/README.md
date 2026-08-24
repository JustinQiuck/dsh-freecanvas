# dsh-plugin-freecanvas

DSH FreeCanvas 是直接运行在 DeepSeek Harness 内的自包含画布插件，提供侧边栏入口、会话/分屏/画布三种布局，以及本地 Canvas Agent 自动连接。

## 功能

- 在 DSH 侧边栏增加「DSH FreeCanvas」入口。
- 画布前端随插件包发布，由 DSH 同源提供，安装后不需要另行启动 Web 服务。
- 支持会话、分屏和全画布模式，并保存分屏比例。
- 使用随包安装的 `@basketikun/canvas-agent` 自动启动本地 Agent HTTP 服务，不在运行时临时下载脚本。
- 可选配置外部画布地址，仅用于开发调试。
- 可配合 `@deepseek-ai/dsh-mcp-client` 将画布 MCP 工具注册给 DSH agent。

## 在 DSH 中使用

在 DSH 插件市场搜索并安装 **DSH FreeCanvas**，然后从侧边栏打开。插件已经包含构建后的画布，普通用户不需要克隆仓库、启动 Docker 或开放本地 3000 端口。

## 源码开发

调试插件时，从仓库源码目录安装依赖并生成插件内置资源：

```bash
npm --prefix web install --legacy-peer-deps
npm --prefix plugins/dsh-freecanvas install --no-package-lock --legacy-peer-deps
npm --prefix plugins/dsh-freecanvas run build:web
dsh plugin --profile desktop add ./plugins/dsh-freecanvas
```

执行 `npm pack` 或发布插件时会通过 `prepack` 自动运行同一构建流程，并把生成的 `web/` 静态资源加入包内。

提交发布候选前可运行以下只读检查；它会验证 bundle manifest、宿主/客户端入口、内置 Web、许可证、第三方声明和候选包敏感信息边界，不会发布 npm 包，也不会留下 `.tgz` 文件：

```bash
npm --prefix plugins/dsh-freecanvas run test:host
npm --prefix plugins/dsh-freecanvas run verify:package
```

仓库 CI 还会安装固定的 `@deepseek-ai/dsh@0.1.1-rc.2`，然后执行：

```bash
DSH_CLI_BIN=/path/to/dsh npm --prefix plugins/dsh-freecanvas run verify:dsh-install
```

该命令只使用一次性 `DSH_HOME`：从真实 tarball 安装插件、检查唯一 bundle/entry、重复安装、启动内置画布、确认官方渠道保持关闭，再卸载并启动基础 Web profile。自动验收会关闭 Canvas Agent，避免读写用户的 `~/.infinite-canvas`；Canvas Agent 冷启动、侧边栏和布局交互仍由真实 DSH Desktop 终验负责。

插件使用独立版本和 `dsh-plugin-freecanvas@<version>` Git tag，不与根项目 `VERSION` 或根项目 `v*` tag 绑定。

本包通过 `dsh.bundle.patch` 自动插入 `ui-dsh-freecanvas`，不要在 profile 的 `cordis.patch.yml` 中重复声明同一个 id。

## 配置

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `canvasUrl` | 空 | 留空使用插件内置画布；填写后改为代理指定的外部画布服务 |
| `autoStartAgent` | `true` | 随 DSH 自动启动本地 Canvas Agent HTTP 服务 |
| `officialChannelEnabled` | `false` | 官方生图/视频渠道总开关；在完成独立商业验收前保持关闭 |
| `officialChannelSingleUserMode` | `false` | 仅确认 DSH 仅供当前本机用户使用时才可开启；共享或远程访问时必须保持关闭 |
| `officialChannelDevelopmentMode` | `false` | 仅允许开发时使用 loopback HTTP 官方服务；生产环境必须保持关闭 |
| `officialApiUrl` | 空 | 仅由插件宿主访问的 New API 服务根地址；生产必须是无路径、无查询参数的 HTTPS 地址，不填写密钥 |
| `officialAccountPortalUrl` | 空 | 用户获取配对码的 New API 钱包页面；生产必须是无查询参数的 HTTPS 地址 |

可以在 DSH 设置的插件配置中修改，也可以在 profile 补丁中配置：

```yaml
- id: ui-dsh-freecanvas
  name: dsh-plugin-freecanvas
  config:
    autoStartAgent: true
    officialChannelEnabled: false
```

普通用户保持 `canvasUrl` 为空。只有调试外部画布时才填写地址，例如 `canvasUrl: http://127.0.0.1:3000`。浏览器仍通过 DSH 同源路由加载，不会直接导航到跨域 iframe。

官方媒体渠道的生产地址、用户点数、卡密兑换与供应商密钥由后续的 New API 服务端流程管理。插件不会在这里保存 KIE Key，也不会默认启用官方渠道。只有完成真实图片/视频、余额、失败退款、日志脱敏和商业授权验收后，才由运营方单独把 `officialChannelEnabled` 和 `officialChannelSingleUserMode` 设为 `true`。开发联调如需 HTTP，只能同时启用 `officialChannelDevelopmentMode` 并使用 `127.0.0.1`、`localhost` 或 `::1`。

开启后的设备令牌只由 DSH 宿主保存在本机 `~/.infinite-canvas/official-account.json`，使用权限受限的原子文件写入；浏览器只能访问同源的固定账户和媒体代理，不能读取该令牌。该文件不得进入配置导出、WebDAV、支持包或日志；断开连接时先请求服务端撤销，撤销失败则立即隔离本机凭据。该边界尚待独立测试与部署验收，不代表官方渠道已经开放。

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

`dsh-plugin-freecanvas` 从 `v0.2.0` 起采用 [Elastic License 2.0](./LICENSE)。该协议允许在协议范围内使用、复制、修改和分发插件，但不允许将其作为托管服务提供给第三方，也不允许规避或移除许可证密钥功能。

历史 `v0.1.0` 的已有授权不因后续版本更改而被追溯撤回。上游 MIT 组件仍按其原协议授权，详见 [LICENSING.md](./LICENSING.md) 与 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。未来的 Pro 功能不属于当前公开 bundle，将在发布时使用独立商业 EULA。
