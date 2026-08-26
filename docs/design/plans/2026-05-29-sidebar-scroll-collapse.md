# 侧边栏滚动与折叠优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复侧边栏会话过多时无法滚动的问题，并支持点击项目收起/展开会话列表，附带滚动条美化和折叠动画。

**Architecture:** 将 sidebar 改为三段式 flex 布局（固定 brand 头 + 可滚动项目列表 + 固定 binding 底），新增前端 `collapsedProjects` 状态控制折叠，用 CSS `max-height` 过渡实现动画。

**Tech Stack:** React (useState), CSS (flex layout, webkit scrollbar, max-height transition)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `apps/desktop/src/renderer/styles.css` | 新增 `.sidebar-scroll`、`.sidebar-footer`、滚动条样式、折叠动画 CSS |
| `apps/desktop/src/renderer/app/shell/DesktopShell.tsx` | sidebar JSX 结构调整 + `collapsedProjects` 状态 + 点击逻辑 |
| `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx` | 新增折叠交互测试 |

---

### Task 1: CSS — 侧边栏分区布局与滚动条

**Files:**
- Modify: `apps/desktop/src/renderer/styles.css:211-218` (`.sidebar` 规则)
- Modify: `apps/desktop/src/renderer/styles.css:306-309` (`.sb-label-bottom` 规则)
- Create (append): 新增 `.sidebar-scroll`、`.sidebar-footer`、滚动条样式

- [ ] **Step 1: 修改 `.sidebar` 规则，移除 overflow-y: auto**

将 `styles.css` 第 211-219 行的 `.sidebar` 规则改为：

```css
.sidebar {
  border-right: 1px solid var(--b2);
  background: linear-gradient(180deg, rgba(245, 231, 199, 0.05) 0%, transparent 32%), rgba(18, 20, 16, 0.9);
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

变更：移除 `overflow-y: auto`（第 218 行），保留 `overflow: hidden`。

- [ ] **Step 2: 修改 `.sb-label-bottom` 规则，移除 margin-top: auto**

将 `styles.css` 第 306-309 行改为：

```css
.sb-label-bottom {
  padding-top: 12px;
  border-top: 1px solid var(--b1);
}
```

变更：移除 `margin-top: auto`（不再需要，由 flex 布局的 `.sidebar-footer` 自然推到底部）。

- [ ] **Step 3: 新增 `.sidebar-scroll` 和 `.sidebar-footer` 规则**

在 `.sidebar` 规则块之后（第 219 行后）插入：

```css
.sidebar-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 2px;
}

.sidebar-footer {
  flex-shrink: 0;
}
```

- [ ] **Step 4: 新增自定义滚动条样式**

紧接 `.sidebar-footer` 之后插入：

```css
.sidebar-scroll::-webkit-scrollbar {
  width: 6px;
}

.sidebar-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
}

.sidebar-scroll:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.22);
}
```

- [ ] **Step 5: 新增折叠动画样式**

紧接滚动条样式之后插入：

```css
.proj-group .conv-list {
  max-height: 2000px;
  overflow: hidden;
  transition: max-height 0.25s ease, opacity 0.2s ease;
  opacity: 1;
}

.proj-group.collapsed .conv-list {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  transition: max-height 0.2s ease, opacity 0.15s ease, padding 0.2s ease;
}
```

- [ ] **Step 6: 运行 lint 验证 CSS 无语法错误**

Run: `yarn lint`
Expected: 无 CSS 相关错误

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/renderer/styles.css
git commit -m "style(sidebar): add scroll partition layout, custom scrollbar, and collapse animation"
```

---

### Task 2: JSX — 侧边栏结构分区

**Files:**
- Modify: `apps/desktop/src/renderer/app/shell/DesktopShell.tsx:1607-1749` (sidebar prop)

- [ ] **Step 1: 在 sidebar 内容中包裹 `.sidebar-scroll` 容器**

将 `DesktopShell.tsx` 第 1607-1749 行的 sidebar prop 内容改为以下结构：

```tsx
sidebar={
  <>
    <div className="brand-row">
      <div className="brand-icon">TC</div>
      <div className="brand-info">
        <strong>{tCommon("app.name")}</strong>
        <span>{tCommon("app.tagline")}</span>
      </div>
      <button className="new-btn" type="button" disabled={isBusy} onClick={() => void importProject()}>
        + {tShell("sidebar.new-btn")}
      </button>
    </div>

    <div className="sidebar-scroll">
      <div className="sb-label">{tShell("sidebar.projects-label")}</div>
      {hasProjects ? (
        projectSummaries.map((project) => (
          /* ... proj-group 内容保持不变 ... */
        ))
      ) : (
        <div className="conv-empty sidebar-empty">
          <span>{tShell("sidebar.no-projects")}</span>
          <button className="conv-empty-btn" type="button" disabled={isBusy} onClick={() => void importProject()}>
            {tShell("sidebar.import-project")}
          </button>
        </div>
      )}
    </div>

    <div className="sidebar-footer">
      <div className="sb-label sb-label-bottom">{tShell("sidebar.binding-label")}</div>
      <div className="binding-row">
        <div className="binding-info">
          <strong>{shellProjectDisplay}</strong>
          <span>{tShell("sidebar.project-label")}</span>
        </div>
        <span className="ttag status-chip idle">{hasProjects ? tCommon("state.ready") : tCommon("state.empty")}</span>
      </div>
      <div className="binding-row active">
        <div className="binding-info">
          <strong>{shellConversationDisplay}</strong>
          <span title={currentWorktreePath}>{currentWorktreeLabel || tShell("shell.default-worktree")}</span>
        </div>
        <span className={`ttag status-chip ${getRunStatusTone(context.shell.runStatus)}`}>{shellRunStatusDisplay}</span>
      </div>
      <div className="binding-row">
        <div className="binding-info">
          <strong>{shellProviderDisplay}</strong>
          <span>{tShell("sidebar.provider-label")}</span>
        </div>
        <span className="ttag status-chip idle">{tCommon("state.later")}</span>
      </div>
    </div>
  </>
}
```

关键变更：
- `brand-row` 保持在最外层（固定顶部）
- `sb-label` "PROJECTS" + 所有 `proj-group` 包进 `<div className="sidebar-scroll">`
- `sb-label-bottom` "BINDING" + 所有 `binding-row` 包进 `<div className="sidebar-footer">`

- [ ] **Step 2: 运行 typecheck 确认无类型错误**

Run: `yarn typecheck`
Expected: PASS，无错误

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/app/shell/DesktopShell.tsx
git commit -m "refactor(sidebar): wrap project list in scroll container, fix binding to footer"
```

---

### Task 3: 折叠状态与交互逻辑

**Files:**
- Modify: `apps/desktop/src/renderer/app/shell/DesktopShell.tsx` (state + onClick + className)

- [ ] **Step 1: 新增 `collapsedProjects` state**

在 `DesktopShell.tsx` 第 886 行（`isCustomModelDialogOpen` state 之后）添加：

```tsx
const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
```

需要确保 `useState` 已从 react 导入（已有）。

- [ ] **Step 2: 修改 proj-row-btn 的 onClick 逻辑**

将第 1629 行的 onClick：

```tsx
onClick={() => { if (!isBusy) void selectProject(project.id) }}
```

改为：

```tsx
onClick={() => {
  if (isBusy) return
  if (project.isCurrent) {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(project.id)) {
        next.delete(project.id)
      } else {
        next.add(project.id)
      }
      return next
    })
  } else {
    setCollapsedProjects((prev) => {
      if (!prev.has(project.id)) return prev
      const next = new Set(prev)
      next.delete(project.id)
      return next
    })
    void selectProject(project.id)
  }
}}
```

- [ ] **Step 3: 同步修改 onKeyDown 逻辑**

将第 1630-1635 行的 onKeyDown：

```tsx
onKeyDown={(event) => {
  if (!isBusy && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault()
    void selectProject(project.id)
  }
}}
```

改为：

```tsx
onKeyDown={(event) => {
  if (!isBusy && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault()
    if (project.isCurrent) {
      setCollapsedProjects((prev) => {
        const next = new Set(prev)
        if (next.has(project.id)) {
          next.delete(project.id)
        } else {
          next.add(project.id)
        }
        return next
      })
    } else {
      setCollapsedProjects((prev) => {
        if (!prev.has(project.id)) return prev
        const next = new Set(prev)
        next.delete(project.id)
        return next
      })
      void selectProject(project.id)
    }
  }
}}
```

- [ ] **Step 4: 修改 proj-group 的 className**

将第 1623 行：

```tsx
<div className={`proj-group${project.isCurrent ? " open" : ""}`} key={project.id}>
```

改为：

```tsx
<div className={`proj-group${project.isCurrent ? " open" : ""}${project.isCurrent && collapsedProjects.has(project.id) ? " collapsed" : ""}`} key={project.id}>
```

- [ ] **Step 5: 修改 chevron 图标逻辑**

将第 1638 行：

```tsx
<FontAwesomeIcon icon={project.isCurrent ? faChevronDown : faChevronRight} />
```

改为：

```tsx
<FontAwesomeIcon icon={project.isCurrent && !collapsedProjects.has(project.id) ? faChevronDown : faChevronRight} />
```

- [ ] **Step 6: 修改 conv-list 渲染条件（始终渲染以支持动画）**

将第 1661 行：

```tsx
{project.isCurrent ? (
  <div className="conv-list">
```

保持不变——`conv-list` 在 `isCurrent` 时始终渲染。CSS `.collapsed .conv-list` 的 `max-height: 0` 负责隐藏。无需改动此处条件。

确认：第 1715 行的 `) : null}` 保持不变。当 `!project.isCurrent` 时不渲染 conv-list（非当前项目本来就不展示会话）。

- [ ] **Step 7: 运行 typecheck**

Run: `yarn typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/renderer/app/shell/DesktopShell.tsx
git commit -m "feat(sidebar): add project collapse/expand toggle on click"
```

---

### Task 4: 测试

**Files:**
- Modify: `apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx`

- [ ] **Step 1: 添加折叠交互测试**

在测试文件末尾（最后一个 `describe` 块之后）添加：

```tsx
describe("sidebar project collapse", () => {
  it("collapses conversation list when clicking the current project", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    const teamcowApi = {
      ...baseMockApi,
      getAppContext: vi.fn().mockResolvedValue(projectWithConversationsContext),
      selectProject: vi.fn().mockResolvedValue({ status: "ok", context: projectWithConversationsContext })
    }
    Object.defineProperty(window, "teamcow", { value: teamcowApi, writable: true, configurable: true })

    let root: ReturnType<typeof createRoot>
    await act(async () => {
      root = createRoot(container)
      root.render(<I18nProvider locale="en"><DesktopShell /></I18nProvider>)
    })

    // Verify conv-list is visible initially
    const convList = container.querySelector(".conv-list")
    expect(convList).not.toBeNull()
    expect(convList?.closest(".proj-group")?.classList.contains("collapsed")).toBe(false)

    // Click the current project row to collapse
    const projRow = container.querySelector(".proj-group.open .proj-row-btn") as HTMLElement
    await act(async () => { projRow.click() })

    // Verify collapsed class is added
    expect(projRow.closest(".proj-group")?.classList.contains("collapsed")).toBe(true)

    // Click again to expand
    await act(async () => { projRow.click() })
    expect(projRow.closest(".proj-group")?.classList.contains("collapsed")).toBe(false)

    // Cleanup
    await act(async () => { root.unmount() })
    document.body.removeChild(container)
  })

  it("does not call selectProject when toggling collapse on current project", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)

    const selectProjectMock = vi.fn().mockResolvedValue({ status: "ok", context: projectWithConversationsContext })
    const teamcowApi = {
      ...baseMockApi,
      getAppContext: vi.fn().mockResolvedValue(projectWithConversationsContext),
      selectProject: selectProjectMock
    }
    Object.defineProperty(window, "teamcow", { value: teamcowApi, writable: true, configurable: true })

    let root: ReturnType<typeof createRoot>
    await act(async () => {
      root = createRoot(container)
      root.render(<I18nProvider locale="en"><DesktopShell /></I18nProvider>)
    })

    // Click the current project row
    const projRow = container.querySelector(".proj-group.open .proj-row-btn") as HTMLElement
    await act(async () => { projRow.click() })

    // selectProject should NOT have been called (only toggle collapse)
    expect(selectProjectMock).not.toHaveBeenCalled()

    // Cleanup
    await act(async () => { root.unmount() })
    document.body.removeChild(container)
  })
})
```

注意：此测试依赖 `projectWithConversationsContext` 和 `baseMockApi`。如果这些 fixture 不存在，需要基于现有 `projectOnlyContext` 扩展一个包含 conversations 的 context fixture。查看测试文件中是否已有类似 fixture，如有则复用，如无则在测试文件顶部创建。

- [ ] **Step 2: 运行测试**

Run: `yarn workspace @teamcow/desktop test -- --run apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx`
Expected: 所有测试 PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/app/shell/__tests__/DesktopShell.test.tsx
git commit -m "test(sidebar): add project collapse toggle interaction tests"
```

---

### Task 5: 验证与收尾

**Files:** None (verification only)

- [ ] **Step 1: 运行完整 typecheck**

Run: `yarn typecheck`
Expected: PASS

- [ ] **Step 2: 运行完整 lint**

Run: `yarn lint`
Expected: PASS

- [ ] **Step 3: 运行完整测试**

Run: `yarn test`
Expected: 所有测试 PASS

- [ ] **Step 4: 手动验证（如可启动 dev server）**

Run: `yarn dev`

验收检查：
1. 项目下有多个会话时，侧边栏中间区域可滚动
2. Brand 头部和 Binding 底部固定不动
3. 滚动条为细条样式，hover 时加深
4. 点击已展开的当前项目 → 会话列表收起（带动画）
5. 再次点击 → 展开
6. 点击其他项目 → 切换并自动展开

- [ ] **Step 5: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix(sidebar): address review feedback"
```
