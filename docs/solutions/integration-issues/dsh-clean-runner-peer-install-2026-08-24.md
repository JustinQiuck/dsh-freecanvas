---
title: DSH clean runner 安装卡住或缺少 peer 依赖
date: 2026-08-24
category: integration-issues
module: DSH marketplace release CI
problem_type: integration_issue
component: tooling
symptoms:
  - npm 默认安装长时间停留在 peer 依赖解析
  - 使用 --legacy-peer-deps 后 DSH 启动报缺少 cordis-plugin-group
  - pnpm 完整安装因未审批的依赖构建脚本退出失败
root_cause: incomplete_setup
resolution_type: workflow_improvement
severity: high
tags: [dsh, pnpm, peer-dependencies, github-actions, marketplace]
---

# DSH clean runner 安装卡住或缺少 peer 依赖

## Problem

市场发布 CI 需要在全新 runner 安装固定版本的 DSH CLI，再用真实候选 tarball 完成插件生命周期验证。单纯切换 npm 的 peer 解析参数无法同时满足安装速度和完整运行依赖，导致发布门禁无法稳定完成。

## Symptoms

- `npm install @deepseek-ai/dsh@0.1.1-rc.2` 或 `--force` 在 React 等 peer 版本冲突中长时间解析。
- `npm install --legacy-peer-deps` 可以快速结束，但 `dsh --profile web --dump-config` 报缺少 `@deepseek-ai/cordis-plugin-group` 等运行时 peer。
- 直接改用 pnpm 会自动补齐 peer，但以 `ERR_PNPM_IGNORED_BUILDS` 拒绝未审阅的 `node-pty`、`koffi` 等安装脚本。

## What Didn't Work

- 继续等待 npm 默认或 `--force` 解析：安装超过数分钟仍未完成，不适合作为 20 分钟 CI job 的前置步骤。
- 使用 npm `--legacy-peer-deps`：绕过了解析冲突，也同时绕过了 DSH 运行所需的 peer 安装；只检查 CLI 文件存在或 `--version` 无法发现该问题。
- 对 pnpm 开启全局 `dangerouslyAllowAllBuilds`：可以消除构建阻塞，但把当前及未来全部传递依赖的脚本执行权交给安装过程，范围过宽。

## Solution

在一次性目录使用 pnpm 安装固定 DSH 基线，由 pnpm 自动补齐 peer；仅通过重复的 `--allow-build` 参数放行本次依赖图中确实需要构建的 5 个包：

```yaml
- name: Install the pinned DSH lifecycle baseline
  run: |
    mkdir -p "$RUNNER_TEMP/dsh-cli"
    pnpm --dir "$RUNNER_TEMP/dsh-cli" init
    pnpm --dir "$RUNNER_TEMP/dsh-cli" \
      --allow-build=@deepseek-ai/dsh-subprocess-local \
      --allow-build=@google/genai \
      --allow-build=koffi \
      --allow-build=node-pty \
      --allow-build=protobufjs \
      add @deepseek-ai/dsh@0.1.1-rc.2
```

安装后不要只执行版本检查。把生成的 CLI 交给 `verify:dsh-install`，在一次性 `DSH_HOME` 中依次验证 baseline 配置、候选 tarball 安装、重复安装、内置 Web、卸载和基础 Web 重启。

## Why This Works

DSH 的包图大量使用 peer 依赖表达宿主服务定义。pnpm 会自动安装这些 peer，避免 `--legacy-peer-deps` 产生“CLI 文件存在但启动依赖不完整”的假阳性；精确构建白名单又保留了 pnpm 的供应链保护，只让已审阅且 DSH 当前确实需要的原生或代码生成包执行脚本。固定 DSH 版本和真实生命周期验证共同防止上游依赖漂移静默改变发布结果。

## Prevention

- DSH 基线升级时先在一次性目录重新确认被拦截的构建包；只有理解用途后才更新精确白名单，不使用 `dangerouslyAllowAllBuilds`。
- CI 必须至少执行一次 `dsh --profile web --dump-config`，并继续跑完整插件安装/启动/卸载；`dsh --version` 不是运行时完整性证据。
- 保持 Node、pnpm 和 DSH 基线固定；上游 latest 兼容性探测应独立报告，不能悄然替换正式发布门禁。
- 官方渠道在自动 profile 中保持关闭，生命周期测试不得访问 KIE 或用户级 `~/.infinite-canvas`。

## Related Issues

- [发布计划 Unit 2](../../plans/2026-08-24-001-feat-dsh-marketplace-release-plan.md)
- [GitHub Actions run 32721242203](https://github.com/JustinQiuck/dsh-freecanvas/actions/runs/32721242203)
- `.github/workflows/dsh-freecanvas-package.yml`
- `.context/compound-engineering/todos/010-complete-p1-automate-dsh-clean-install-verification.md`
- 当前仓库未启用 GitHub Issues，因此没有可关联的 issue。
