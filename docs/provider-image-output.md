# Provider 图片输出

TeamCow 将 provider 返回的图片内容先保存为会话 artifact，再使用附件协议进行预览。图片失败不会把整轮会话改为失败，已接收的文字和工具结果会保留。

## 接入格式

| Provider | 已接入的输出 |
| --- | --- |
| Codex | App Server `imageGeneration` 完成事件、MCP 工具的图片内容 |
| Cursor | `cursor/generate_image` 文件通知、ACP assistant 图片块、工具输出中的图片和图片资源 |
| Claude Code | `tool_result` 中的图片内容，包括 MCP 返回的 base64 图片 |
| OpenCode | Server SSE 的 assistant 图片 FilePart、已完成工具的图片 attachments；CLI 工具附件 |
| 通用 | 完整回复中的 Markdown 图片：相对路径、绝对路径、file URL、data URL；远程 HTTP(S) 图片预览 |

多个工具图片会分别展示，同一图片事件的重复回放不会重复展示。用户上传的图片不会被识别为新生成的输出。

本地与内联图片支持 PNG、JPEG、GIF、WebP，每张最多 32 MiB。相对路径从会话绑定的 worktree 解析；本地来源限制在 worktree、系统临时目录和 Codex 的 generated_images 目录，通过真实路径校验防止软链接越界。主进程保存副本，renderer 不直接访问文件系统。图片随会话删除。

远程 HTTP(S) 图片保留 URL，通过浏览器预览；没有在主进程下载永久副本，因此仍受网络、登录要求及链接有效期影响。不支持的图片格式或丢失的文件会显示加载失败提示。只有一段声称图片已经生成的文字、没有图片内容或引用时，TeamCow 无法据此恢复图片。

旧 Codex 生成事件、Cursor 文件通知，以及仍包含可用图片数据的旧工具事件，可在读取历史时恢复。已经被旧版截断且没有文件引用的 base64 无法恢复。

## 验证与来源

自动化测试覆盖协议归一化、保存、实时事件、历史回放、多图去重、本地 Markdown 路径、路径隔离、预览与加载失败提示。协议模拟测试不代表已对每个 provider 的在线模型或第三方 MCP 服务进行实际生成测试。

- [Cursor ACP 扩展](https://prod.cursor.com/docs/cli/acp)
- [ACP 内容块](https://agentclientprotocol.com/protocol/content)（同时核对已安装 SDK 的 schema）
- [Claude 工具结果中的图片](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls)
- [OpenCode SDK 的 FilePart / ToolStateCompleted](https://github.com/anomalyco/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts)
