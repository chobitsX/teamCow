# 侧边栏滚动与折叠优化设计

**日期**: 2026-05-29  
**范围**: `apps/desktop/src/renderer` — DesktopShell.tsx + styles.css  
**目标**: 修复侧边栏会话过多时无法滚动的问题，并支持点击项目收起/展开会话列表

---

## 问题分析

### 问题 1：侧边栏无法滚动

`.sidebar` 设置了 `overflow-y: auto`，但作为 CSS Grid 子项（`.ws` 使用 `grid-template-columns`），在内容超出时未能正确触发滚动。原因是 sidebar 内部使用 `flex-direction: column` 且底部 binding 区域使用 `margin-top: auto` 撑开空间，导致 flex 容器的隐式高度计算超出 grid cell 约束，内容被 `.shell-frame` 的 `overflow: hidden` 裁切。

### 问题 2：项目无法折叠

`selectProject` 只执行"选中"操作，没有 toggle 逻辑。点击已选中的项目会重新调用 `selectProject(project.id)`，后端返回相同 context，项目保持展开状态。UI 中会话列表的渲染条件为 `project.isCurrent`，没有独立的折叠状态。

---

## 设计方案

### §1 侧边栏结构调整（分区布局）

将 sidebar 从"整体滚动"改为"固定头尾 + 中间独立滚动"的三段式布局。

**HTML 结构**（DesktopShell.tsx sidebar prop）：

```
<aside class="sidebar">
  ├── div.brand-row              ← flex-shrink:0，固定顶部
  ├── div.sidebar-scroll         ← flex:1 + min-height:0 + overflow-y:auto（新增容器）
  │   ├── div.sb-label "PROJECTS"
  │   └── div.proj-group × N
  └── div.sidebar-footer         ← flex-shrink:0，固定底部（新增容器）
      ├── div.sb-label "BINDING"
      └── div.binding-row × 3
</aside>
```

**CSS 变更**：

| 选择器 | 变更 |
|--------|------|
| `.sidebar` | 移除 `overflow-y: auto`，保持 `overflow: hidden` |
| `.sidebar-scroll`（新增） | `flex: 1; min-height: 0; overflow-y: auto; padding: 0 4px;` |
| `.sidebar-footer`（新增） | `flex-shrink: 0;` |
| `.sb-label-bottom` | 移除 `margin-top: auto`（改由 flex 布局自然推到底部） |

**原理**：`min-height: 0` 打破 flex 子项的默认 `min-height: auto` 约束，允许 `.sidebar-scroll` 在内容超出时正确触发 `overflow-y: auto`。

---

### §2 项目折叠交互

点击已展开的项目可以收起会话列表，保持项目选中状态不变。

**状态管理**：

```tsx
const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
```

**点击逻辑**（`proj-row-btn` onClick）：

```
if (点击的是非当前项目) {
  selectProject(id)
  collapsedProjects.delete(id)  // 确保目标项目展开
} else {
  toggle collapsedProjects.has(id)  // 当前项目：切换折叠
}
```

**渲染条件**：

`.conv-list` 始终渲染（不再用条件渲染移除 DOM），改由 CSS `.collapsed` class 控制 `max-height: 0` 实现折叠动画。

```tsx
// 原来：条件渲染
{project.isCurrent ? (<div className="conv-list">...</div>) : null}

// 改为：始终渲染，通过 proj-group 的 collapsed class 控制可见性
{project.isCurrent ? (<div className="conv-list">...</div>) : null}
// proj-group className 加入 collapsed：
// className={`proj-group${project.isCurrent ? " open" : ""}${collapsedProjects.has(project.id) ? " collapsed" : ""}`}
// 当 isCurrent && collapsed 时，conv-list 仍在 DOM 中，但 max-height:0 + opacity:0
```

**Chevron 图标**：

```tsx
icon={project.isCurrent && !collapsedProjects.has(project.id) ? faChevronDown : faChevronRight}
```

**边界情况**：
- 切换到另一个项目时，自动从 collapsed 集合中移除目标 id（确保展开）
- 折叠状态纯前端，不持久化，页面刷新后恢复展开
- `isBusy` 时折叠操作同样被禁止（复用现有 guard）

---

### §3 体验改进

#### 自定义滚动条（macOS overlay 风格）

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

#### 折叠动画

使用 `max-height` 过渡实现平滑展开/收起：

```css
.conv-list {
  max-height: 2000px;
  overflow: hidden;
  transition: max-height 0.25s ease, opacity 0.2s ease;
  opacity: 1;
}

.proj-group.collapsed .conv-list {
  max-height: 0;
  opacity: 0;
  transition: max-height 0.2s ease, opacity 0.15s ease;
}
```

对应 JSX 中 `proj-group` 的 className 逻辑：

```tsx
className={`proj-group${project.isCurrent ? " open" : ""}${collapsedProjects.has(project.id) ? " collapsed" : ""}`}
```

注意：如 §2 所述，`.conv-list` 在 `isCurrent` 时始终保留在 DOM 中，折叠通过 `.collapsed` class 控制 `max-height` 过渡。

---

## 改动文件清单

| 文件 | 改动类型 |
|------|----------|
| `apps/desktop/src/renderer/app/shell/DesktopShell.tsx` | sidebar JSX 结构 + 折叠状态逻辑 |
| `apps/desktop/src/renderer/styles.css` | 新增 `.sidebar-scroll`、`.sidebar-footer`、滚动条样式、折叠动画 |

---

## 不涉及的范围

- store / IPC / 数据层：折叠为纯前端状态
- 其他面板（inspector、main-area）：不受影响
- i18n：无新增用户可见文案
- 测试：现有 DesktopShell 测试中 sidebar 渲染断言可能需要适配新容器层级

---

## 验收标准

1. 项目下有 10+ 会话时，侧边栏中间区域可滚动，brand 和 binding 固定可见
2. 点击已展开的当前项目，会话列表收起并带动画过渡
3. 再次点击收起的项目，会话列表展开
4. 点击其他项目时，目标项目自动展开
5. 滚动条为 macOS 风格细条，hover 时加深
6. `yarn typecheck` 和 `yarn lint` 通过
