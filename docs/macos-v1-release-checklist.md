# TeamCow macOS V1 发布验收清单

本清单用于发布候选版本的人工验收。执行人应记录应用版本、macOS 版本、芯片架构、Git commit、验收时间与失败项证据。

## 发布前门禁

- [ ] 在仓库要求的 Node 版本下完成 `yarn typecheck`、`yarn lint`、`yarn test` 与 `yarn i18n:check`。
- [ ] 完成 `yarn build` 和 `yarn workspace @teamcow/desktop smoke`，无未解释的错误或崩溃。
- [ ] 安装生成的 macOS 产物，确认应用版本、签名/未签名分类和更新元数据与本次发布一致。
- [ ] 使用全新用户数据目录和已有用户数据目录各启动一次；SQLite migration、完整性检查及启动恢复均成功。

## 核心产品闭环

- [ ] 以 `Project -> Conversation` 为主路径导入现有 Git 项目，默认 worktree 正确创建且不会成为顶级导航心智。
- [ ] 新建 conversation 时可以选择 provider、model、访问模式与执行目标；切换 provider 会创建新 conversation。
- [ ] provider readiness 正确区分 ready、unavailable、unknown，并优先采用本地 CLI 原生认证状态。
- [ ] 发送消息后可持续看到规范化输出、工具活动和运行状态；停止运行后已接收内容仍可审查。
- [ ] 强制退出并重启应用后，遗留 running run 被标记为 interrupted，历史记录保持可读。
- [ ] 长 conversation 初始只加载最新历史，加载更早历史后顺序、去重和滚动位置正确。

## Inspector 审查路径

- [ ] Files 能浏览 conversation 绑定 worktree，文件创建、重命名、保存与删除均不能越过 worktree 边界。
- [ ] Diff 能区分 staged、unstaged、untracked 与 conflict，并对大文件/二进制内容提供受控降级。
- [ ] Git 状态、提交范围、identity、remote 与历史正确；读取不会阻塞 UI，写操作在同一 worktree 内串行。
- [ ] Terminal 仅作为人工接管入口；终端输出不会混入 provider chat 时间线，重启与 resize 正常。
- [ ] Open in Editor 和 Finder 打开 conversation 当前 worktree；文件跳转不能逃逸项目根目录。

## 系统集成与安全

- [ ] 后台 conversation 完成或失败时能产生 notification；当前聚焦 conversation 不重复通知。
- [ ] update 检查、下载状态和重启安装路径可用；未配置正式 feed 时不会被标记为 feed-ready。
- [ ] 删除 conversation/worktree、丢弃变更等不可逆操作均显示 destructive confirmation，取消后不改变磁盘或数据库。
- [ ] 退出应用会先停止活跃 provider、等待受管后台写入并关闭 WAL；超时路径可诊断且不会无限挂起。
- [ ] 日志、发布包和 manifest 不包含 token、认证文件、用户项目内容或本地数据库。

## 可访问性与本地化

- [ ] 英文和中文界面均无缺失 key、空白文本或明显溢出；重要状态不只依赖颜色表达。
- [ ] 键盘可完成 Project/Conversation 选择、消息发送、停止、Inspector 切换和确认对话框操作。
- [ ] VoiceOver 能识别关键按钮、运行状态、错误提示和加载更早历史入口。

## 验收结论

- [ ] 所有必验项通过；任何豁免均包含负责人、风险说明、回退方案和截止日期。
- [ ] 发布产物已在 Apple Silicon 真机验证；如支持 Intel，同时记录对应验证结果。
