# 参与 TeamCow 开发

感谢你愿意帮助改进 TeamCow。项目目前以 macOS 和本地 provider 工作流为优先，请让改动保持小而可验证，并尊重现有的 `Project -> Conversation` 产品模型。

## 开始之前

- 搜索已有 issue，避免重复报告或并行实现同一问题。
- 功能建议应说明用户场景、期望行为和为什么它属于 TeamCow 的核心工作流。
- 安全问题不要创建公开 issue，请按 [SECURITY.md](SECURITY.md) 报告。
- 日志、截图和测试夹具必须移除 token、本机用户名与路径、用户项目内容、会话内容和数据库数据。

参与本项目即表示你同意在协作中保持尊重、克制和建设性。维护者可以关闭骚扰、歧视、人身攻击、泄露隐私或明显偏离项目范围的互动。

## 开发环境

项目使用 Node.js `22.22.2`、Yarn `1.22.22` 和 Yarn workspaces。

```bash
corepack enable
yarn install --frozen-lockfile
yarn dev
```

不要提交 `package-lock.json` 或 `pnpm-lock.yaml`。新增前端依赖时使用 Yarn，并说明引入依赖的必要性。

## 架构约束

- `renderer` 不得直接访问 `fs`、`git`、`pty`、`child_process` 或 provider 进程。
- `renderer -> main` 通过 preload 暴露的 `window.teamcow` API 和统一的 `teamcow:invoke` IPC channel。
- 跨 IPC、provider 输出和持久化边界的数据使用共享 Zod schema 校验。
- provider 原始输出先归一化为 run event、message 或 artifact，再进入持久化与聊天渲染。
- 用户可见文本必须进入中英文 i18n 资源。

更多背景见 [docs/architecture.md](docs/architecture.md) 和 [AGENTS.md](AGENTS.md)。

## 提交改动

1. 从最新 `main` 创建主题分支。
2. 增加或更新与行为相邻的测试。
3. 运行与改动范围匹配的检查。
4. 使用 Pull Request 模板说明动机、风险、验证结果和截图脱敏情况。

默认质量门禁：

```bash
yarn typecheck
yarn lint
yarn test
yarn i18n:check
```

涉及 Electron 启动、原生模块、provider 或桌面集成时，再运行：

```bash
yarn build
yarn workspace @teamcow/desktop smoke
```

## Pull Request 范围

- 一个 PR 聚焦一个问题，避免顺手重构无关模块。
- 不要提前实现没有明确需求的 provider、平台或产品层级。
- 不要提交生成的 `apps/desktop/src/renderer/public/file-icons/`；它由开发和构建脚本自动生成。
- 新依赖必须具有与项目许可证兼容的授权，并在需要时更新 `THIRD_PARTY_NOTICES.md`。
- UI 变更应提供脱敏截图；重要状态不能只依赖颜色表达。

提交贡献即表示你有权提交相关内容，并同意该贡献依据项目的 [Apache License 2.0](LICENSE) 发布；除非你在提交时明确以书面形式声明该内容不属于 Contribution。
