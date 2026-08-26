# 公开仓库快照发布流程

TeamCow 在同一个本地 Git 仓库中维护两条用途不同、历史互不相连的分支：

- `dev`：日常开发分支，保留完整开发历史，只同步到可信的私有远端。
- `main`：公开快照分支，每次发布只增加一个聚合提交，不包含 `dev` 的父提交或历史。

公开仓库只推送 `main`。不要对公开远端使用 `git push --all`、`git push --tags` 或 `git push --mirror`。

## 脚本做什么

`yarn publish:public` 在不切换分支、不改动工作区的情况下：

1. 要求当前位于 `dev` 且工作区干净。
2. 检查 Apache-2.0 法律文件、package 元数据、已知本地目录、gitlink、大文件、常见凭据和私人身份字符串。
3. 默认运行 typecheck、lint、test、i18n 和桌面 smoke。
4. 使用 `dev` 当前完整文件树，在 `main` 上创建一个新的聚合提交。
5. 使用公开身份 `chobitsX <chobitsX@users.noreply.github.com>`，避免泄露私有 Git 配置。
6. 默认只更新本地 `main`；仅在显式传入 `--push` 时推送，而且只推送 `main:main`。

第一次绑定新的空 GitHub 仓库：

```bash
git remote add public git@github.com:chobitsX/你的新仓库名.git
git push -u public main
```

## 后续发布

先在 `dev` 正常开发并提交，然后执行：

```bash
yarn publish:public --message "chore: publish open-source snapshot"
git log --oneline --decorate main -5
git diff main^ main
git push public main:main
```

也可以在确认远端名称和状态后显式让脚本推送：

```bash
yarn publish:public --message "chore: publish v0.1.0 snapshot" --push
```

其他选项：

```bash
yarn publish:public --dry-run
yarn publish:public --message "..." --skip-checks
yarn publish:public --help
```

`--skip-checks` 只适合质量门禁刚刚完整通过的情况。安全与隐私检查不会因此跳过。

## 处理公开仓库贡献

如果公开 `main` 接受了外部 Pull Request，下一次快照前先把对应改动移植或 cherry-pick 到 `dev`，然后同步本地公开分支基线：

```bash
git fetch public main
# 确认公开改动已经进入 dev 后：
git branch -f main public/main
yarn publish:public --message "chore: publish open-source snapshot" --push
```

脚本在发现 `public/main` 与本地 `main` 不一致时会拒绝推送，避免覆盖公开贡献。
