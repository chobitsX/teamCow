# TeamCow Superset-Inspired Theme Refresh Design

- 日期：2026-07-08
- 状态：设计已确认，待用户审阅
- 范围：`apps/desktop` renderer 整体主题配色刷新，包括主 UI、Terminal、Files 代码编辑器和状态色
- 参考：
  - `references/upstream/superset/apps/marketing/public/marketplace/themes/catppuccin-macchiato.json`
  - `references/upstream/superset/apps/desktop/src/shared/themes/built-in/light.ts`
  - `references/upstream/superset/apps/desktop/src/shared/themes/editor-theme.ts`
  - `docs/design/specs/2026-06-10-theme-system-design.md`

## 背景

TeamCow 已经具备 `Dark / Light / System` 主题机制、`ThemeProvider`、`data-theme="dark|light"`、设置持久化和语义 CSS token。当前问题不是缺主题系统，而是现有配色仍偏早期 graphite/warm-paper 方案，和用户现在希望参考的 Superset 主题方向不一致。

用户希望：

- 暗色主题整体参考 Superset 中的 Catppuccin Macchiato。
- 亮色主题整体参考 Superset 内置 Light。
- 只优化整体主题配色，不改设置 UI，也不引入 Superset 的 custom theme / marketplace 模型。
- Terminal 和 Files 代码编辑器也必须一起跟随新主题，形成完整一套视觉系统。

## 目标

1. 在不改变现有主题偏好模型的前提下，重映射 TeamCow 的 dark/light 语义 token。
2. 暗色主题采用 Catppuccin Macchiato 的底色、文字、面板、状态和终端色体系，但保留 TeamCow 的低饱和蓝作为主交互强调色。
3. 亮色主题采用 Superset built-in Light 的干净中性灰白层级，替换当前暖纸色倾向。
4. Terminal 使用完整 ANSI token，而不是只跟随背景和前景。
5. CodeMirror 编辑器使用 TeamCow 自定义主题，与主 UI、Terminal、diff 和状态色统一。
6. 通过现有 `ThemePalette.test.ts` 锁定关键主题契约，避免后续无意漂移。

## 不做项

- 不改 Settings 里的外观 segmented control 为 Superset 式下拉器。
- 不新增 Monokai、Catppuccin 或 Custom themes 作为可选主题。
- 不引入 Superset 的 theme import、marketplace、theme metadata 或主题文件模型。
- 不新增 IPC、DB schema、i18n 文案或设置项。
- 不重构整个 `styles.css` 或 `DesktopShell.tsx` 大文件。
- 不提前做高对比模式、主题编辑器或用户自定义色。

## 推荐方案

采用“TeamCow 化的 Superset 色板映射”。

现有主题系统继续保持：

- `data-theme="dark|light"`
- `Dark / Light / System`
- `ThemeProvider`
- `styles.css` 语义 token
- Settings 外观 segmented control

实现只替换主题 token 和相关渲染读取逻辑。这样既能获得 Superset 参考主题的整体观感，又不会把后续才可能需要的 custom theme 架构提前引入。

## 暗色主题设计

暗色主题参考 Catppuccin Macchiato，但不是完全照搬。TeamCow 的产品约束仍要求专业、克制、高信息密度，避免紫色 SaaS 感。因此暗色分两层处理：

- 背景、面板、文字、边框、状态色、Terminal ANSI 色忠实接近 Macchiato。
- 主交互强调色保持 TeamCow 化的低饱和蓝，优先使用 Macchiato blue 系方向，而不是把 mauve/pink 作为全局主色。

核心映射：

| TeamCow token | 目标方向 |
| --- | --- |
| `--bg-canvas` | Macchiato base `#24273a` |
| `--bg-surface` | Macchiato mantle `#1e2030` |
| `--bg-raised` | base 与 surface 之间的抬升层 |
| `--bg-inset` | Macchiato crust `#181825` |
| `--text-primary` | Macchiato text `#cad3f5` |
| `--text-secondary` | Macchiato subtext `#a5adcb` |
| `--text-tertiary` / `--text-muted` | overlay / surface 较低层级 |
| `--accent` | 低饱和蓝，接近 Macchiato blue `#8aadf4`，按对比适度调整 |
| `--accent-bg` / `--accent-border` | 由 accent 派生的低透明叠加 |
| `--border-*` | `#363a4f` / `#494d64` 一类 Macchiato surface 层级 |
| `--surface-hover` / `--surface-active` | Macchiato text/blue 的轻透明叠加 |
| `--state-selected` | accent 的中低透明叠加 |

紫色和粉色不作为全局主交互色，只用于少量高亮、provider tag 或编辑器语法色，以保留 Macchiato 气质但不压过工作台本身。

## 亮色主题设计

亮色主题参考 Superset built-in `Light`，即接近黑白中性 OKLCH 灰阶的轻量工作台，而不是 Catppuccin Latte。

核心映射：

| TeamCow token | 目标方向 |
| --- | --- |
| `--bg-canvas` | Superset Light background，接近纯白 |
| `--bg-surface` | Superset card/muted，接近 `oklch(0.97 0 0)` |
| `--bg-raised` | 白色或极浅灰，靠边框和轻阴影区分 |
| `--bg-inset` | Superset tertiary，接近 `oklch(0.95 0.003 40)` |
| `--text-primary` | Superset foreground，接近 `oklch(0.145 0 0)` |
| `--text-secondary` | 中性灰，接近 Superset muted foreground |
| `--accent` | TeamCow 低饱和蓝，亮色下压深以保证白底可读 |
| `--border-*` | Superset border/input/ring 的低对比灰 |
| `--surface-hover` / `--surface-active` | 黑色低透明叠加 |

这会把当前偏 warm paper 的 light 主题转成更干净、更接近 Superset 设置截图中的 light 观感。

## Terminal 设计

Terminal 不再只读取 `--terminal-bg` 和 `--terminal-fg`，而是扩展为完整 xterm 色板 token：

- `--terminal-bg`
- `--terminal-fg`
- `--terminal-cursor`
- `--terminal-cursor-accent`
- `--terminal-selection-bg`
- `--terminal-black`
- `--terminal-red`
- `--terminal-green`
- `--terminal-yellow`
- `--terminal-blue`
- `--terminal-magenta`
- `--terminal-cyan`
- `--terminal-white`
- `--terminal-bright-black`
- `--terminal-bright-red`
- `--terminal-bright-green`
- `--terminal-bright-yellow`
- `--terminal-bright-blue`
- `--terminal-bright-magenta`
- `--terminal-bright-cyan`
- `--terminal-bright-white`

暗色 Terminal 参考 Catppuccin Macchiato：

- background `#24273a`
- foreground `#cad3f5`
- cursor `#f4dbd6`
- selection `#5b6078`
- ANSI red/green/yellow/blue/magenta/cyan 使用 Superset Macchiato theme 中的对应值

亮色 Terminal 参考 Superset Light 默认 xterm 色板，保持白底黑字和传统 ANSI 色，避免亮色终端在实际命令输出中可读性下降。

`DesktopShell.tsx` 中的 xterm 初始化读取这些 token，并为缺失 token 保留兜底值。主题切换后的 terminal 是否实时重配色按现有生命周期处理；如果已有实例不会自动更新，应在实现计划中补一个最小 effect，对当前 terminal instance 调用 `term.options.theme = nextTheme`。

## Code Editor 设计

当前 Files 代码编辑器深色使用 CodeMirror `oneDark`，亮色使用 `defaultHighlightStyle`。这会让编辑器和 TeamCow 新主题出现断层。

本次改为自定义 CodeMirror theme：

- `createEditorSyntaxThemeExtension("dark")` 返回 Macchiato-inspired editor theme。
- `createEditorSyntaxThemeExtension("light")` 返回 Superset-Light-inspired editor theme。
- theme 同时覆盖 editor chrome 和 syntax highlighting。

暗色编辑器：

- 背景使用 Macchiato crust/mantle/base 分层。
- gutter、active line、selection、search highlight 使用 Macchiato surface 和 TeamCow accent 派生。
- 语法色从 Macchiato terminal / semantic palette 派生，例如 keyword 使用 mauve，string 使用 green，number 使用 peach/yellow，function 使用 blue，comment 使用 overlay。

亮色编辑器：

- 背景使用白色或极浅灰。
- gutter、active line、selection、search highlight 参考 Superset Light 的 muted/accent 层。
- 语法色保持足够传统和清晰，优先选择蓝、绿、橙、红、紫，但饱和度控制在亮色 UI 可读范围内。

实现可以保留现有 `CodeEditor.tsx` 的 `useTheme()` 和 compartment reconfigure 模式，只替换 `editor-syntax-theme.ts` 的实现。

## 状态色与 Provider 色

状态色统一跟随新主题：

| 语义 | 暗色方向 | 亮色方向 |
| --- | --- | --- |
| success | Catppuccin green | Superset chart green / 可读 green |
| warning | Catppuccin yellow | Superset chart warm color |
| error | Catppuccin red | Superset destructive red |
| info | TeamCow accent blue | TeamCow accent blue |
| git added | success | success |
| git modified | accent blue | accent blue |
| git removed | error | error |

Provider 仍保持 codex、claude、opencode 的差异化表达，但降低当前渐变的攻击性：

- codex 可保留粉紫方向，但透明背景和边框降低存在感。
- claude 使用暖橙方向。
- opencode 使用绿色/青色方向。
- 三者的 tag、avatar、border 和 clipped text gradient 在同一强度层级，不能抢过 chat 与 inspector 主内容。

## 文件范围

预计修改：

- `apps/desktop/src/renderer/styles.css`
  - 重映射 dark/light token。
  - 新增 terminal ANSI token。
  - 调整 provider/status/git token。
  - 必要时清理仍写死为旧 accent 或旧暖纸色的少量局部阴影/颜色。
- `apps/desktop/src/renderer/app/shell/DesktopShell.tsx`
  - Terminal 初始化读取完整 ANSI token。
  - 如现有 terminal 实例主题不会随 `data-theme` 更新，新增最小同步逻辑。
- `apps/desktop/src/renderer/app/shell/editor/editor-syntax-theme.ts`
  - 替换 `oneDark/defaultHighlightStyle` 为自定义 CodeMirror theme。
- `apps/desktop/src/renderer/app/providers/__tests__/ThemePalette.test.ts`
  - 更新 dark/light token 期望。
  - 新增或扩展 terminal ANSI token 断言。
  - 保留 provider token 断言，但更新为新色板。

可能修改：

- `apps/desktop/src/renderer/app/shell/editor/CodeEditor.tsx`
  - 只有在自定义 CodeMirror theme 需要额外 extension 接入时才改。
- 邻近测试文件
  - 如果 terminal theme 同步逻辑需要行为测试，再补充最小测试。

不预计修改：

- `packages/shared-types/src/index.ts`
- `apps/desktop/src/main/project-service.ts`
- `apps/desktop/src/main/desktop-router.ts`
- `apps/desktop/src/main/preload/api.ts`
- `packages/i18n-resources`

## 测试与验证

实现完成后至少运行：

```bash
yarn workspace @teamcow/desktop test ThemePalette
yarn workspace @teamcow/desktop test
yarn typecheck
```

如果实现中意外改到用户可见文案，再运行：

```bash
yarn i18n:check
```

建议额外做一次视觉冒烟：

- 启动 `yarn dev`。
- 分别切换 Dark、Light、System。
- 检查主工作台三栏、Settings drawer、Files editor、Diff、Git、Terminal、provider tag、status chip。
- 确认暗色不变成高饱和紫色 SaaS 风，亮色不再偏暖纸。
- 确认 Terminal ANSI 输出在两主题下可读。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 暗色 Macchiato 太紫，偏离 TeamCow 专业工作台约束 | 背景采用 Macchiato，主强调色保留低饱和蓝，紫粉只做语法/provider 点缀 |
| 亮色主题过白，长时间使用刺眼 | 通过 `--bg-surface`、`--bg-inset`、边框和 hover 层维持面板层次 |
| Terminal 主题只在初始化时生效，切换主题后旧实例不更新 | 实现计划中检查 xterm instance 生命周期，必要时补 `term.options.theme` 同步 |
| CodeMirror 自定义 theme 不完整导致默认样式泄漏 | 在 `editor-syntax-theme.ts` 同时定义 editor chrome 和 syntax highlighting |
| `styles.css` 中残留旧暖纸/旧蓝阴影 | 实现后用 `rg` 扫描旧关键色值，并由 `ThemePalette.test.ts` 锁定新 token |

## 验收标准

1. 暗色主题整体观感接近 Superset 的 Catppuccin Macchiato，但主操作色仍保持 TeamCow 化的低饱和蓝。
2. 亮色主题整体观感接近 Superset 内置 Light，不再是当前 warm paper 风格。
3. 主 UI、Terminal、Files 代码编辑器、状态色和 provider tag 在两主题下形成统一色彩系统。
4. 现有主题切换交互、持久化和 System 跟随行为保持不变。
5. 不新增主题下拉器、自定义主题导入、额外设置项或 i18n 文案。
6. 主题 token 测试和相关类型检查通过。
