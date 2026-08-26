# TeamCow 主题系统设计（Light/Dark 双主题 + 语义 Token 重构）

- 日期：2026-06-10
- 状态：已确认设计，待写实现计划
- 范围：`apps/desktop` renderer 主题色系统 + 主题切换持久化

## 背景与问题

当前 `apps/desktop/src/renderer/styles.css` 是**单一硬编码暗色主题**：

- 顶部 `:root` 硬编码 `color-scheme: dark`，无 light 主题、无切换开关。
- 颜色以原始变量形式散落（`--g950`、`--ink`、`--blue2`、`--s1`、`--b1` 等），全文件约 422 处 `var(--xxx)` 引用。
- 变量语义已腐坏：`--ochre` 实际被赋成蓝色 `#7a9dcc`，名实不符。
- 表面叠加色 `--s1/--s2/--s3` 与边框 `--b1/--b2/--b3` 全为白色透明叠加 `rgba(255,255,255,.x)`，是"深色专属假设"，无法用于 light。
- 阴影硬编码重黑影 `rgba(0,0,0,.4)`，浅色下脏。
- 终端色在 `DesktopShell.tsx:2091` 硬编码。

UX 规划文档（`ux-design-specification.md` / `ux-implementation-constraints.md`）要求 **Light + Dark 双主题共享同一套语义色系，Dark 为默认**。当前实现不满足。

## 目标

1. 建立**可主题化的两层 token 架构**（palette + 语义层），消除变量语义腐坏。
2. 实现 **Light / Dark / 跟随系统** 三档主题，持久化到 `app_settings`。
3. 视觉气质对标 **Linear / Vercel**：冷调中性灰 + 蓝焦点，克制、系统化、精致。
4. 全部文字与状态色达到 **WCAG AA**（正文 ≥4.5:1，大字/次要 ≥3:1）。
5. **重新调和 provider 语义色**（codex/claude/opencode 同梯度、不抢镜）。

## 已知偏离（需记录）

用户明确选择"冷灰+蓝调 + 对标 Linear/Vercel"，这与项目硬约束（`AGENTS.md`、`ux-implementation-constraints.md` 要求"暖石墨+奶油+赭金、避免紫色 SaaS 感"）存在偏离。**用户指令优先级更高**，本设计按用户方向执行。后续 BMad review 可能标记此偏离，属预期。

## 明确不做（YAGNI）

- 不引入 CSS 色彩库（Radix/shadcn 等），保持现有手写 CSS variables 风格。
- 不做高对比模式、不做 `forced-colors` 适配。
- 不做每会话主题、不做用户自定义主题色。
- 不做主题切换动画过渡（切换瞬间反而要临时禁用 transition 防拖影）。

## 第 1 节 · Token 两层架构

**底层 — 原始调色板（palette，主题无关，只定义一次）**

纯色阶，不被组件直接引用，只被语义层引用：

- 冷调蓝灰中性阶（非纯灰）：`--gray-950` … `--gray-50` 共 12 阶
- 蓝（accent）阶：`--blue-600` … `--blue-300`
- 状态色阶：`--green-*` / `--amber-* (warning)` / `--red-* (error)`
- provider 专用色阶（见第 3 节）

**语义层 — 语义 token（组件只引用这一层）**

按用途命名，light/dark 各自映射到不同色阶：

- 背景：`--bg-canvas` / `--bg-surface` / `--bg-raised` / `--bg-overlay`
- 文字：`--text-primary` / `--text-secondary` / `--text-tertiary` / `--text-muted`
- 边框：`--border-subtle` / `--border-default` / `--border-strong`
- 焦点：`--accent` / `--accent-hover` / `--accent-bg` / `--accent-border`
- 状态：`--status-success` / `--status-warning` / `--status-error` / `--status-info`（各含 `-bg` / `-border` 变体）
- 表面交互态：`--surface-hover` / `--surface-active` / `--state-selected`
- git：`--git-added` / `--git-modified` / `--git-removed`
- 阴影：`--shadow-sm` / `--shadow-md` / `--shadow-lg` / `--shadow-xl`（分主题）
- 圆角：`--radius-*`（主题无关，沿用现有）
- 字体：`--font-mono` / `--font-sans`（主题无关）
- 焦点环：`--focus-ring`（分主题，glow 透明度不同）

**应用方式**

```css
:root, :root[data-theme="dark"] { /* palette + dark 语义映射 */ }
:root[data-theme="light"]       { /* light 语义映射 */ }
```

`<html data-theme="dark">`，启动时由持久化设置决定；选 system 时读 `prefers-color-scheme`。

**变量命名决策（已确认）**：彻底改语义名。`--ink` → `--text-primary`、`--g900` → `--bg-surface`、`--s1` → `--surface-hover`、`--b1` → `--border-subtle` 等，全部约 422 处引用一起替换。用映射表逐一替换，避免遗漏。

**旧→新映射表（实现时据此全局替换）**

| 旧变量 | 新语义 token |
|---|---|
| `--g950` | `--bg-canvas` |
| `--g900` | `--bg-surface` |
| `--g850` | `--bg-raised` |
| `--g800` / `--g750` | `--bg-raised`（按场景细分） |
| `--ink` | `--text-primary` |
| `--ink2` | `--text-secondary` |
| `--ink3` | `--text-tertiary` |
| `--ink4` | `--text-muted` |
| `--cream` / `--cream2` | `--text-primary` / `--text-secondary` |
| `--blue` | `--accent` |
| `--blue2` | `--accent-hover` |
| `--blue-bg` | `--accent-bg` |
| `--blue-bd` | `--accent-border` |
| `--ochre` / `--ochre-hot` | 并入 `--accent` 家族（旧值本是蓝） |
| `--green*` | `--status-success*` |
| `--amber*` | `--status-warning*` |
| `--rust*` | `--status-error*` |
| `--s1/--s2/--s3` | `--surface-hover` / `--surface-active` / `--state-selected` |
| `--b1/--b2/--b3` | `--border-subtle` / `--border-default` / `--border-strong` |
| `--sh-*` | `--shadow-*` |
| `--r*` | `--radius-*` |
| `--mono` / `--sans` | `--font-mono` / `--font-sans` |

> 注：git 专用 `--git-*` 已是语义名，保留并接入新体系。映射表在实现时核对全部 `var()` 出现点。

**Token 使用规范（写入注释 + 文档）**：组件只准引用语义 token；禁止裸 hex / 裸 rgba。新增颜色先进 palette + 语义层。

## 第 2 节 · 两主题具体色值

**底层调色板（冷调蓝灰，非纯灰）**

```
--gray-950 #0a0b0d   --gray-900 #0f1115   --gray-850 #14161b
--gray-800 #1a1d23   --gray-750 #20242b   --gray-700 #2a2f37
--gray-600 #3a404a   --gray-500 #4e5560   --gray-400 #6b727d
--gray-300 #9aa0ab   --gray-200 #c4c9d1   --gray-100 #e4e7ec   --gray-50 #f7f8fa
--blue-600 #3b6fe0   --blue-500 #4f7dff   --blue-400 #6b94ff   --blue-300 #9db8ff
```

**Dark 主题（默认）**

| 语义 token | 值 | 对比度 |
|---|---|---|
| `--bg-canvas` | `#0a0b0d` | — |
| `--bg-surface` | `#0f1115` | — |
| `--bg-raised` | `#14161b` | — |
| `--text-primary` | `#e4e7ec` | 14:1 ✓ |
| `--text-secondary` | `#9aa0ab` | 6.8:1 ✓ |
| `--text-tertiary` | `#6b727d` | 3.6:1 ✓（仅大字/标签） |
| `--text-muted` | `#4e5560` | 装饰用，不承载正文 |
| `--accent` | `#4f7dff` | — |
| `--accent-hover` | `#6b94ff` | — |
| `--border-subtle` | `rgba(255,255,255,.07)` | — |
| `--border-default` | `rgba(255,255,255,.12)` | — |
| `--border-strong` | `rgba(255,255,255,.18)` | — |
| `--surface-hover` | `rgba(255,255,255,.04)` | — |
| `--surface-active` | `rgba(255,255,255,.07)` | — |
| `--state-selected` | `rgba(79,125,255,.10)` | — |

**Light 主题**

| 语义 token | 值 | 对比度 |
|---|---|---|
| `--bg-canvas` | `#f7f8fa` | — |
| `--bg-surface` | `#ffffff` | — |
| `--bg-raised` | `#ffffff`（靠阴影抬升） | — |
| `--text-primary` | `#14161b` | 15:1 ✓ |
| `--text-secondary` | `#4e5560` | 7.4:1 ✓ |
| `--text-tertiary` | `#6b727d` | 4.6:1 ✓ |
| `--text-muted` | `#9aa0ab` | 装饰用 |
| `--accent` | `#3b6fe0` | 5.1:1 ✓（白底需压深） |
| `--accent-hover` | `#3060c8` | — |
| `--border-subtle` | `rgba(10,11,13,.08)` | — |
| `--border-default` | `rgba(10,11,13,.14)` | — |
| `--border-strong` | `rgba(10,11,13,.20)` | — |
| `--surface-hover` | `rgba(10,11,13,.04)` | — |
| `--surface-active` | `rgba(10,11,13,.07)` | — |
| `--state-selected` | `rgba(59,111,224,.10)` | — |

**关键点**：accent 蓝在 light 下从 `#4f7dff` 压到 `#3b6fe0` 以满足白底 AA。这正是"共享语义、各自映射"的价值。accent 定为 Vercel 风鲜蓝（非 Linear 蓝紫），避免紫调。

**状态色（两主题）**

| token | dark | light |
|---|---|---|
| `--status-success` | `#5ed4a8` | `#1f9d6b` |
| `--status-warning` | `#e0a84d` | `#b8791f` |
| `--status-error` | `#e06060` | `#cc3b3b` |
| `--status-info` | `--accent` | `--accent` |

各状态派生 `-bg`（约 8% 透明）/`-border`（约 24% 透明）变体。

**git/diff 色（两主题，AA 适配）**

| token | dark | light |
|---|---|---|
| `--git-added` | `#5ed4a8` | `#1f9d6b` |
| `--git-modified` | `#9db8ff` | `#3b6fe0` |
| `--git-removed` | `#f07070` | `#cc3b3b` |

**阴影（分主题）**

| token | dark | light |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.3)` | `0 1px 2px rgba(10,11,13,.06)` |
| `--shadow-md` | `0 4px 16px rgba(0,0,0,.2)` | `0 4px 12px rgba(10,11,13,.08)` |
| `--shadow-lg` | `0 12px 32px rgba(0,0,0,.3)` | `0 12px 28px rgba(10,11,13,.10)` |
| `--shadow-xl` | `0 24px 64px rgba(0,0,0,.4)` | `0 24px 56px rgba(10,11,13,.12)` |

## 第 3 节 · Provider 语义色调和

原则：**同一明度/饱和度梯度，只换色相**，让三个 provider tag 成一个家族而非三种强度。claude 用暖橙（非紫，呼应品牌且避开紫调约束）。

| Provider | 当前 | dark token 值 | light token 值 |
|---|---|---|---|
| codex | `#5f8cff` | `--provider-codex` `#6b94ff` | `#3b6fe0` |
| claude | `#e0a84d` | `--provider-claude` `#d98c4a` | `#b8702e` |
| opencode | `#5ed4a8` | `--provider-opencode` `#4db58a` | `#2f9468` |

每个 provider 派生 `-bg`（8% 透明）与 `-border`（24% 透明）变体。tag（`.ttag.codex/.claude/.opencode`）与 avatar（`.msg-avatar.*`）统一引用这三组 token，三色处于同一 SLV 梯度。

## 第 4 节 · 主题切换交互与持久化

**数据层**：`app_settings` 新增 key=`app.theme`，值 `dark`/`light`/`system`。复用现有 editor/locale 的 `getX`/`setX` 落地模式，无需改 DB schema。

**契约层**：
- `packages/shared-types/src/index.ts`：新增 `AppThemePreference` zod schema（枚举 `dark|light|system`）+ `getAppTheme` / `setAppTheme` 命令的 input/result schema。
- `desktop-router.ts`：新增 `getAppTheme` / `setAppTheme` 两个 case，并加入 handoff 映射表。
- `project-service.ts`：新增主题读写函数（模式同 `getSelectedEditor`/`setSelectedEditor`）。
- `preload/api.ts` + `preload/types.ts`：暴露 `getAppTheme` / `setAppTheme` 到 `window.teamcow`。

**应用层**：
- 新增 `apps/desktop/src/renderer/app/providers/ThemeProvider.tsx`：启动读设置 → 设 `document.documentElement.dataset.theme`；选 `system` 时监听 `window.matchMedia('(prefers-color-scheme: dark)')` 并响应变化。
- `main.tsx`：首屏同步设 `data-theme`（读缓存值），防止默认 dark 闪一下再切 light。
- 切换瞬间临时禁用全局 transition（加 `data-theme-switching` 标记类，下一帧移除），避免彩色拖影。这是"无主题动画"的正确实现。

**交互**：
- `SettingsDrawer.tsx` "通用"组语言下方新增 segmented control（复用语言切换同款 `.segmented-control`），三档：Dark / Light / 跟随系统。
- `i18n-resources`：新增主题相关 en + zh 键值（标题、描述、三档标签、note），跑 `yarn i18n:check`。

**原生控件适配**：
- `color-scheme` 跟随 `data-theme`（dark/light），保证 `<select>`、滚动条、输入框光标等原生控件正确。
- 滚动条、`::selection`、`--focus-ring` 全部 token 化并分主题。

**无障碍**：
- 新增 `@media (prefers-reduced-motion: reduce)`：关闭 `stream` 流式动画与抽屉 `slide-in` 动画。

## 第 5 节 · 实现范围、测试、风险

**改动文件**
- `apps/desktop/src/renderer/styles.css` — 重写 token 体系（palette + dark/light 语义层），全局替换约 422 处旧变量引用为语义名；新增 reduced-motion、token 化滚动条/selection/focus-ring。
- `packages/shared-types/src/index.ts` — `AppThemePreference` + 命令契约。
- `apps/desktop/src/main/project-service.ts` — 主题读写。
- `apps/desktop/src/main/desktop-router.ts` — 命令 case + handoff 映射。
- `apps/desktop/src/main/preload/api.ts` + `types.ts` — 暴露 API。
- 新增 `apps/desktop/src/renderer/app/providers/ThemeProvider.tsx`。
- `apps/desktop/src/renderer/main.tsx` — 首屏防闪。
- `apps/desktop/src/renderer/app/settings/SettingsDrawer.tsx` — 主题 segmented control。
- `packages/i18n-resources/src` — 主题 en/zh 键值。
- `apps/desktop/src/renderer/app/shell/DesktopShell.tsx:2091` — 终端硬编码色改读 CSS 变量，跟随主题。

**测试**
- `project-service` 主题读写单测（仿 editor 测试）。
- `shared-contracts` 校验新 schema。
- `ThemeProvider` 单测：三档切换 + system 监听响应。
- 运行 `yarn typecheck && yarn lint && yarn test && yarn i18n:check`。
- WCAG 对比度实测值在第 2 节列出；运行期靠 token 保证。
- 两主题各做一次视觉冒烟（dark + light）。

**风险与缓解**
- 约 422 处替换可能遗漏/错配 → 用第 1 节映射表逐一替换 + lint + 视觉冒烟，搜索残留裸 `--g`/`--ink`/`--s`/`--b` 引用。
- light 主题为新增，多数组件此前仅在 dark 验证 → 实现后两主题都冒烟。
- 终端 / xterm viewport 等少数硬编码色点单独处理。

## 验收标准

1. Settings 可切 Dark / Light / 跟随系统，重启后保持。
2. 两主题下文字与状态色全部达 WCAG AA（第 2 节实测值）。
3. styles.css 无裸 hex / 裸 rgba 出现在组件规则中（仅 palette 层定义原始值）。
4. provider tag 三色同梯度、克制成体系，claude 非紫。
5. 原生控件（select/滚动条）、`::selection`、focus-ring、阴影在两主题下均正确。
6. `prefers-reduced-motion` 下动画关闭。
7. 主题切换无彩色拖影、无首屏闪烁。
8. `yarn typecheck && yarn lint && yarn test && yarn i18n:check` 全绿。
