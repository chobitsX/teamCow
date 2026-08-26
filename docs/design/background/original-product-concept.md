# Local Coding Agent Workspace（设计方案 v3）

---

# 🧭 一、产品定义

> **一个 Chat-first 的本地 Coding Agent 工作台（Workspace OS）**
> 

---

## 🎯 产品目标

构建一个桌面应用，通过优秀的 Chat UI + 项目管理体验，统一使用本地已有的 AI Coding Agent：

- Codex CLI
- Claude Code
- OpenCode
- 未来扩展（Cursor Agent / Gemini CLI / Qwen Code 等）

---

## ❌ 不做的事情

- 不自己实现 Agent
- 不直接调用模型 API
- 不重造 tool calling / diff / patch 能力

---

## ✅ 要做的事情

- 提供更好的 UI / UX
- 管理任务 / 项目 / agent
- 提供代码变更可视化
- 提供用户控制与安全感

---

# 🧱 二、核心架构

```
Desktop App
├─ Workspace / Project Manager
├─ File Explorer + Editor
├─ Chat UI（任务入口）
├─ Task System（任务生命周期）
├─ Diff / Review Center
├─ Terminal Panel
├─ Worktree Manager（可选）
├─ Approval Center
└─ Agent Runtime Layer
     ├─ Agent Protocol（核心抽象）
     ├─ SDK Adapters（Claude / Codex / OpenCode）
     └─ PTY Adapter（CLI fallback）
```

---

# 🧠 三、核心设计理念

---

## 1️⃣ 不是 Chat App

```
你 ≠ ChatGPT
你 = Agent Workspace / 控制台
```

---

## 2️⃣ Chat 只是入口

真正核心是：

- 文件变更
- diff
- 执行过程
- 可控性

---

## 3️⃣ 用户掌控执行环境

区别于 Conductor：

| 产品 | 策略 |
| --- | --- |
| Conductor | 强制 worktree |
| 你的产品 | 用户可选 |

---

# 🧩 四、核心模块设计

---

## 📁 1. Project Explorer（文件管理）

### 必须支持

- 文件树（tree）
- 搜索（fuzzy search）
- 文件预览（只读）
- 代码高亮
- 点击跳转 diff

---

### 推荐增强

- `@file` / `@folder` 引用
- 最近改动文件
- agent 修改标记
- 文件权限提示

---

## 💬 2. Chat UI（任务入口）

---

### 功能

- 输入任务（自然语言）
- 选择 agent
- 选择执行环境
- 引用文件
- 多轮对话

---

### UI结构

```
Chat
├─ Messages
├─ Agent Status
├─ Tool Events（可选）
└─ Result Summary（diff入口）
```

---

## 🧾 3. Task System（核心）

---

### 数据结构

```
Task{
id
projectId
provider
environment
status
messages
result
}
```

---

### 生命周期

```
created → running → waiting approval → done / failed
```

---

## 🧵 4. Worktree Manager（优化版）

---

### ❌ 不强制

---

### ✅ 提供选项

```
执行环境：
- 当前 workspace（默认）
- 新 worktree
- 已有 worktree
- sandbox（未来）
```

---

### 🧠 智能建议

```
大改动 → 推荐 worktree
小改动 → 当前 workspace
```

---

## 🔍 5. Diff / Review Center（核心价值）

---

### 功能

- 文件列表
- side-by-side diff
- inline diff
- commit message

---

### 操作

- Accept
- Reject
- Edit
- Partial apply

---

## 🖥️ 6. Terminal Panel

---

### 功能

- 实时输出
- 输入接管
- 错误调试

---

## 🔐 7. Approval Center

---

### 控制项

- 文件写入
- shell 执行
- git 操作
- 网络访问

---

### UX

```
Agent wants to:
- modify 10 files
- run npm install

[Approve] [Reject]
```

---

# 🧠 五、Agent 接入架构

---

## 🧩 Agent Protocol（核心）

```
interfaceAgent {
  startSession():Promise<void>
  send(input:string):AsyncIterable<Event>
  stop():void
}
```

---

## 📡 Event 统一

```
typeEvent=
| { type:"text" }
| { type:"diff" }
| { type:"file_change" }
| { type:"tool_call" }
| { type:"status" }
```

---

## 🔵 SDK Adapter

用于：

- Claude Code
- Codex
- OpenCode

---

## 🟡 PTY Adapter

```
node-pty → CLI → parse output
```

---

## 🎯 策略

```
优先 SDK
fallback CLI
```

---

# ⚖️ 六、方案对比（核心）

| 方案 | 实现方式 | 优点 | 缺点 | 推荐 |
| --- | --- | --- | --- | --- |
| SDK Adapter | Claude SDK / Codex runtime | 结构化强、体验好 | 接入复杂 | ⭐⭐⭐⭐ |
| CLI + PTY | node-pty + CLI | 快速、通用 | 难结构化 | ⭐⭐⭐ |
| 混合架构 | SDK + PTY | 平衡 | 复杂度中等 | ⭐⭐⭐⭐⭐ |
| Agent Protocol | 自定义抽象层 | 长期可扩展 | 前期成本高 | ⭐⭐⭐⭐⭐ |
| 自研 Agent | 自己做 loop | 完全控制 | 成本极高 | ❌ |

---

# 🧪 七、技术路线（推荐）

---

## 🚀 Phase 1（MVP）

- Electron / Tauri
- node-pty
- CLI 调 Claude / Codex
- Chat UI
- Terminal

---

## 🚀 Phase 2

- Project Explorer
- Diff Viewer
- Task System
- Worktree（可选）

---

## 🚀 Phase 3

- SDK Adapter
- Event Stream
- Approval System

---

## 🚀 Phase 4

- 多 agent 并行
- MCP / plugin system
- remote execution

---

# 📚 八、参考项目

---

## 🟢 T3 Code（SDK 路线）

[https://github.com/pingdotgg/t3code](https://github.com/pingdotgg/t3code?utm_source=chatgpt.com)

---

## 🟡 Superset（CLI + Terminal）

[https://github.com/superset-sh/superset](https://github.com/superset-sh/superset?utm_source=chatgpt.com)

---

## 🟡 Emdash（CLI registry）

[https://github.com/generalaction/emdash](https://github.com/generalaction/emdash?utm_source=chatgpt.com)

---

## 🔴 Conductor（闭源参考）

[https://www.conductor.build/](https://www.conductor.build/?utm_source=chatgpt.com)

---

# 🎯 九、最终推荐架构

```
Agent Protocol（核心）
   ↓
SDK Adapter（Claude / Codex / OpenCode）
   ↓
PTY Adapter（fallback）
   ↓
Workspace OS（你的产品）
```

---

# 🔥 十、最关键建议

---

## ✅ 你真正的产品是：

```
Agent Workspace OS
```

---

## ❌ 不要做：

- Chat 工具
- 模型代理
- CLI 包装器

---

## ✅ 要做：

- 任务管理
- 多 agent 调度
- diff 审查
- 用户控制体验

---

# 🚀 一句话总结

> **用 Chat 驱动任务，用 Agent 执行任务，用 Diff 呈现结果，用 Workspace 管理一切。**
> 

---

如果你下一步需要，我可以帮你：

- 设计代码目录结构（前后端怎么拆）
- 或直接给你一个 MVP demo 架构（含代码）

这套东西已经可以直接作为你项目的设计蓝图用了。