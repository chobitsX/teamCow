<p align="center">
  <img src="apps/desktop/src/renderer/assets/brand/teamcow-logo-rounded.png" width="80" alt="TeamCow logo">
</p>

<h1 align="center">TeamCow</h1>

<p align="center">
  <strong>为 Codex、Claude Code、OpenCode 和 Cursor Agent 打造的 macOS 桌面工作台。</strong>
</p>

<p align="center">
  沿用已有 CLI 登录，用独立 Git worktree 并行处理任务，<br>
  在同一个本地优先的 AI 编程工作台里查看对话与代码改动。
</p>

<p align="center">
  <a href="https://github.com/chobitsX/teamCow/releases/download/v0.0.3/TeamCow-0.0.3-arm64.dmg"><img alt="下载 TeamCow macOS 版 — Apple Silicon" src="https://img.shields.io/badge/下载_macOS_版-Apple_Silicon-315b7d?style=for-the-badge&logo=apple&logoColor=white"></a>
</p>

<p align="center">
  v0.0.3 预览版 · Developer ID 签名 · 已通过 Apple 公证<br>
  <a href="#快速上手">快速上手</a> · <a href="https://github.com/chobitsX/teamCow/releases/tag/v0.0.3">更新说明</a> · <a href="README.md">English</a>
</p>

<p align="center">
  <img alt="Local first" src="https://img.shields.io/badge/data-local--first-315b7d">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-d6c7a1"></a>
</p>

![为什么需要 TeamCow：沿用本机 CLI 登录，用 Git worktree 隔离并行任务，集中审查实际文件改动](docs/assets/teamcow-why-zh.png)

<p align="center"><em>使用 AI 生成的工作流概念介绍图；产品界面见下方工作台预览。</em></p>

## 为什么使用 TeamCow

编程任务散落在多个终端后，很容易忘记哪个 Agent 正在改哪个目录、最后改了什么。TeamCow 用项目与对话组织已有的编程 CLI，让任务、工作目录和输出记录保持关联。

- **继续使用熟悉的工具。** 接入本机已安装的 Codex、Claude Code、OpenCode 或 Cursor Agent，沿用已有登录、模型、工具和权限确认流程，无需注册 TeamCow 账号。
- **同时推进多个任务。** 给不同对话分配独立 Git worktree，让修 Bug、开发功能和补测试在各自目录中并行执行；汇总代码时再审查和处理合并冲突。
- **看清 Agent 实际做了什么。** 阅读结构化对话和工具事件，检查文件与 Diff，随时在内置终端接手。对话历史和已接收输出保存在本机，中断后仍可回看。

## 快速上手

准备一台 Apple Silicon Mac、Git，以及至少一个已经安装并登录的编程 CLI。TeamCow 安装包自带运行时；从源码开发 TeamCow 才需要另行准备 Node.js 和 Yarn。所选 CLI 可能有自己的运行要求。

1. **安装 TeamCow。** [下载 macOS DMG](https://github.com/chobitsX/teamCow/releases/download/v0.0.3/TeamCow-0.0.3-arm64.dmg)，打开后将 TeamCow 拖入“应用程序”。
2. **导入项目。** 打开 TeamCow，选择本机已有的 Git 仓库。TeamCow 会检测可用的 Provider CLI 及其登录状态。
3. **开始对话。** 选择 Provider 和模型，绑定项目目录或独立 Git worktree，在对话中跟进任务，并在旁边检查代码改动。

`v0.0.3` Apple Silicon（`arm64`）预览版已使用 Developer ID 签名并通过 Apple 公证。Intel Mac、Windows 和 Linux 尚未验证；更新版本目前需要重新下载安装包。

<details>
<summary>校验下载文件或排查安装问题</summary>

使用[发布页](https://github.com/chobitsX/teamCow/releases/tag/v0.0.3)附带的 `teamcow-release-manifest.json` 核对 DMG 的 SHA-256 校验值。macOS 可以验证 Developer ID 签名和已装订的 Apple 公证票据。

如果 macOS 报告验证失败，请先确认下载来源和校验值，再提交问题。TeamCow 不要求关闭 Gatekeeper、选择“仍要打开”，也不要求移除隔离属性。

</details>

## 工作台预览

![TeamCow 三栏工作台：Project、Chat 与 Inspector](app-screenshots/main-sanitized-zh.png)

<p align="center"><em>基于当前产品界面生成的脱敏演示图；项目、路径和对话均为示例数据。</em></p>

TeamCow 的核心模型保持简单：

```text
Project
└── Conversation
    ├── Native provider CLI + Model
    ├── Access mode
    ├── Working directory / Git worktree
    ├── Structured chat timeline
    └── Inspector (Files / Changes / Git / Terminal)
```

一个 Project 可以包含多个 Conversations。每个 Conversation 固定绑定一个 provider、一个 model 和一个工作目录或 Git worktree，因此多个 Agent 可以在同一项目下并行工作，而不会把 Worktree 暴露成用户必须管理的顶层概念。

## 核心能力

- **Bring Your Own Agent**：连接本机已有的 Codex、Claude Code、OpenCode 和 Cursor Agent，不要求 TeamCow 账号或重复认证。
- **保留原生能力**：Provider 继续决定模型、工具、认证、权限和执行行为；TeamCow 不重新实现通用 Agent。
- **结构化 Chat**：区分用户消息、Provider 输出、推理摘要、工具事件和状态变化，不把终端原始流直接塞进对话。
- **并行 Worktree**：为不同 Conversation 绑定独立 worktree，隔离修改并比较结果。
- **结果审查**：在 Files、Changes、Git 和 Diff 视图中检查 Agent 真正写入的内容。
- **人工接管**：通过内置 Terminal 或编辑器继续处理当前工作目录中的任务。
- **本地持久化**：使用 SQLite 保存项目、Conversation、运行事件和产物，失败或中断后仍可继续审查。
- **macOS 工作台体验**：中英文界面、浅色/深色主题、桌面通知和原生窗口工作流。

## 支持的 Provider

请先在终端中独立安装并完成至少一个 provider 的原生认证。TeamCow 会优先使用 CLI 自己的版本和登录状态判断是否可用，不会用辅助网络探测覆盖已经确认的原生认证结果。

| Provider | 本机命令 | 官方资料 |
| --- | --- | --- |
| Codex | `codex` | [openai/codex](https://github.com/openai/codex) |
| Claude Code | `claude` | [Claude Code 文档](https://code.claude.com/docs/en/getting-started) |
| OpenCode | `opencode` | [OpenCode 文档](https://opencode.ai/docs) |
| Cursor Agent | `cursor-agent` | [Cursor CLI 文档](https://cursor.com/docs/cli/overview) |

如果 Provider 尚未安装、未认证或配置无效，TeamCow 会显示不可用原因，并让认证继续在 Provider 原生工具中完成。

## 从源码开发

### 构建环境要求

- macOS（当前唯一完成构建与功能验证的平台）
- Node.js `22.22.2`（见 `.node-version` 和 `.nvmrc`）
- Yarn `1.22.22`（由根目录 `packageManager` 固定）
- Git
- Xcode Command Line Tools（用于 Electron 原生模块）
- 至少一个已经可以在终端正常使用的 provider CLI

### 从源码启动

```bash
corepack enable
yarn install --frozen-lockfile
yarn dev
```

首次启动或 Node/Electron 版本变化后，原生模块重建可能需要一些时间。若 Electron 表现得像普通 Node 进程，请先阅读[桌面开发排障](docs/desktop-dev-troubleshooting.md)。

### 验证改动

```bash
yarn typecheck
yarn lint
yarn test
yarn i18n:check
yarn workspace @teamcow/desktop smoke
```

## 产品状态

TeamCow 当前处于早期版本（`0.0.3`），以 macOS 开发者试用为主。核心 Project、Conversation、Provider、Worktree、Chat 与 Inspector 工作流已经可用。macOS 预览包已使用 Developer ID 正式签名并通过 Apple 公证；自动更新源尚未开放。Windows 和 Linux 版本尚未进行构建与功能验证。

本地构建 macOS 安装包：

```bash
yarn workspace @teamcow/desktop package:mac
```

产物写入 `apps/desktop/release/`。默认本地构建未签名、未公证，不应直接作为正式发行包分发。发布前请完成 [macOS V1 发布验收清单](docs/macos-v1-release-checklist.md)。

## 本地数据与安全

- TeamCow 在 Electron `userData` 目录中保存 `teamcow.sqlite`、Conversation 附件和应用日志，这些内容不会进入仓库。
- TeamCow 沿用本机 Provider 的认证状态，不要求把 Token 或 API Key 粘贴到 TeamCow 账号系统中。
- 日志、Issue 和截图不应包含 Provider 配置、用户项目代码、数据库、Conversation 内容或真实本机路径。
- `full-access` 会启用 Provider 原生的高信任执行能力，只应在理解对应 Provider 行为并信任当前项目时使用。
- 发现安全问题时不要创建公开 Issue，请按[安全策略](SECURITY.md)私下报告。

## 仓库结构

```text
apps/desktop/                 Electron + React 桌面应用
packages/db/                  SQLite / Drizzle schema 与 migration
packages/shared-types/        跨进程类型与 Zod 契约
packages/i18n-resources/      中文和英文资源
scripts/                      仓库级检查与发布脚本
docs/                         架构、排障、发布和设计记录
app-screenshots/              README 使用的脱敏产品演示图
```

文件图标来源于锁定版本的 `material-icon-theme`，会在 `yarn dev` 和 `yarn build` 前自动生成，不提交 1,000 多个派生 SVG。更多边界说明见[架构概览](docs/architecture.md)。

## 参与贡献

请先阅读[贡献指南](CONTRIBUTING.md)。Bug 报告和 Pull Request 请使用仓库模板，并在提交日志或截图前移除 Token、本机路径、用户代码和 Conversation 内容。

项目维护者通过独立的 `dev` 开发历史生成公开 `main` 快照；流程和安全约束见[公开仓库快照发布流程](docs/open-source-publishing.md)。

## 许可证与商标

Copyright 2026 chobitsX。

TeamCow 采用 [Apache License 2.0](LICENSE) 开源，版权与归属信息见 [NOTICE](NOTICE)。第三方依赖、资源和商标仍适用其各自条款，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。TeamCow 与 OpenAI、Anthropic、OpenCode 和 Cursor 不存在隶属或官方背书关系；Apache-2.0 不授予 TeamCow 或第三方商标的使用权。
