# Renderer Re-render / 闪刷 Troubleshooting

记录 renderer 侧因不必要的全局重渲染导致的视觉「闪刷」问题及排查方法。

## 案例：点击侧边栏会话时整个侧边栏闪一下

### Symptom

在左侧边栏点击某个 project 下的某个 conversation 时，除了被点击的会话项高亮切换外，侧边栏的其他区域（如顶部 brand-row 的 `+ New` 按钮、project 行）也会明显闪刷一下，体感不好。

### Root cause

闪刷由两个叠加因素造成，根源都是「局部交互触发了整个 `DesktopShell` 重渲染」：

1. **`commitContext` 替换整个 context 对象**
   `selectConversation`（`apps/desktop/src/renderer/app/shell/shell-store.ts`）等待 IPC 返回后调用 `commitContext(result.context)`，即 `setContext(snapshot)`。后端 `listProjects()`（`apps/desktop/src/main/project-service.ts`）每次都重新构造**全部** project / conversation 对象，导致 `context.projects` 引用整体换新，`projectSummaries` 衍生数据全部失效，侧边栏列表整体重算。

2. **`isBusy` 被大量 UI 元素直接消费**
   `selectConversation` 之前会 `setIsBusy(true)` → IPC → `setIsBusy(false)`。`DesktopShell.tsx` 中有十几处 `disabled={isBusy}` / `aria-disabled={isBusy}`（brand-row、proj-row、composer 等）。`isBusy` 每变一次就触发整个 `DesktopShell` 重渲染，所有依赖它的元素一起重绘 → 闪刷。

简言之：**切换会话本不是破坏性操作，却走了「锁定全局 UI + 替换全量 context」的重路径。**

### Fix

`apps/desktop/src/renderer/app/shell/shell-store.ts` 的 `selectConversation`：

1. **乐观更新高亮**：点击后立刻只 patch `selectedConversationId`，不等 IPC 往返，高亮当帧切换。

   ```ts
   setContext((prev) => ({ ...prev, selectedConversationId: conversationId }))
   ```

2. **去掉 `setIsBusy(true/false)`**：选择会话无需禁用整个 UI，移除后不再触发全局重渲染。

IPC 返回后仍调用 `commitContext` settle 完整 context，但此时 `selectedConversationId` 未变化，对侧边栏的 diff 代价极小，视觉上无延迟、无闪刷。

### 通用排查模式

遇到「局部交互导致大块 UI 闪刷」时，按以下顺序排查：

1. **找触发的 state 变化**：定位事件处理函数（如 `selectConversation`），列出它调用的所有 `setX`。任何一次 setState 都可能重渲染所在组件。
2. **检查是否替换了大对象引用**：`setContext(wholeSnapshot)` / `setState(newArray)` 这类整体替换，会让所有衍生的 `useMemo` / `.map()` 失效。优先改成 patch 局部字段（`{ ...prev, field: x }`）或后端返回 diff。
3. **检查全局 flag（如 `isBusy`）的消费面**：`grep -n "isBusy"` 看有多少元素直接绑定。被大范围消费的 flag，其每次变化都会重绘整个组件。非破坏性操作不要设置它；确需 loading 态时，下沉到局部组件的 state，或用 `React.memo` 隔离不相关子树。
4. **能乐观更新就乐观更新**：纯前端可推导的状态变化（高亮、选中态）不要等 IPC 往返，先本地 patch，IPC 返回再 settle。

### Notes

- 同类风险点：任何「点击 → setIsBusy(true) → await IPC → commitContext(full) → setIsBusy(false)」的处理函数，都可能有同样的全局闪刷。新增交互时优先评估是否真的需要 `isBusy` 和全量 context 替换。
- 治本方向（本次未做、视后续需要再评估）：后端 `getAppContext` / `listProjects` 返回结构保持稳定引用（仅变化的对象换新），或在前端用 `React.memo` 拆分 sidebar 列表项，从根上避免引用抖动导致的重渲染。
