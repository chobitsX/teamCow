# T3 Code 参考发现

## 定位判断

`T3 Code` 更接近一个 `chat-first` 的本地 AI coding GUI。它的核心价值不是工作台功能面很广，而是把成熟 coding agent 工具桥接到一个更易用的交互界面中。

对 TeamCow 而言，`T3 Code` 最值得借鉴的不是“做多少功能”，而是“如何把 chat 作为唯一主入口，并让 provider 保持自己的原生能力边界”。

## 主要借鉴点

### 1. Chat-first 心智

- 用户的核心操作从 chat 开始
- 会话是主要工作单元
- 用户不是先操作 terminal 或文件树，而是先发起任务

这与 TeamCow 的产品定义高度一致，应直接继承。

### 2. Provider 绑定模型

- 新会话创建时选择工具
- 会话创建后绑定单一工具
- 工具原生能力不被完全抹平

这与 TeamCow 已确认的规则一致：

- 新会话时选 `Codex CLI / Claude Code / OpenCode`
- 会话内不热切换 provider
- slash commands、模型切换等能力由 provider 自己定义

### 3. 桌面壳层思路

从 `apps/desktop` 与 `apps/web` 的拆分可看出，`T3 Code` 采用了比较清晰的桌面壳层与前端界面分离思路。  
这说明 TeamCow 也适合把：

- 桌面宿主
- provider 接入
- renderer 交互

分成清晰边界，而不是把所有逻辑都堆在一个 Electron 入口里。

### 4. 轻量桥接，而不是重编排

`T3 Code` 的方向更像“把已有工具接起来”，而不是自己做大而全的 agent orchestration 平台。  
这也和 TeamCow 当前方向一致：桥接成熟工具，而不是重造 agent runtime。

## 不足与局限

### 1. 工作台能力相对弱

相较于 TeamCow 的目标，`T3 Code` 在这些方面不是主要强项：

- 项目级隔离
- `workspace / worktree`
- 结果并行比较
- 文件 / diff / git / terminal 的完整工作台体验

因此 TeamCow 不能只基于 `T3 Code` 的结构扩展，否则很容易停留在“更大的 chat app”。

### 2. 更偏单任务会话体验

`T3 Code` 更强于会话和工具桥接，而不是复杂的项目环境管理。  
TeamCow 需要在此基础上补齐项目维度和执行环境维度。

## 对 TeamCow 的采用建议

### 直接采用

- `chat-first` 主入口
- 新会话时选 provider
- 会话级 provider 绑定
- 保留 provider 原生能力

### 适配吸收

- 桌面壳层组织方式
- provider bridge 的基本抽象
- tool readiness / initialization 的体验

### 不直接采用

- 过于轻量的项目结构
- 只围绕 chat 本身展开的功能边界

## 对应 TeamCow 模块映射

- `packages/provider-core`
- `packages/provider-codex`
- `packages/provider-claude-code`
- `packages/provider-opencode`
- `apps/desktop/src/renderer/panes/chat`
- `apps/desktop/src/main/services/provider-runtime-service`

## 一句话结论

`T3 Code` 是 TeamCow 的“交互参照物”，主要回答：  
**如何把成熟 coding tool 变成一个 chat-first 的可用产品。**
