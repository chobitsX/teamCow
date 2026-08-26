# Desktop Dev Troubleshooting

## Electron starts as Node instead of app host

### Symptom

Running `yarn dev` or `yarn workspace @teamcow/desktop dev` can fail before the window appears with an error like:

```text
TypeError: Cannot read properties of undefined (reading 'whenReady')
```

The compiled main bundle is usually fine, but `require("electron").app` is `undefined`.

### Root cause

This happens when `ELECTRON_RUN_AS_NODE=1` leaks into the desktop app launch environment.

In the TeamCow workspace, the variable was not found in common shell rc files such as `~/.zshrc` or `~/.zprofile`, and `launchctl getenv ELECTRON_RUN_AS_NODE` was empty. The variable was present in Codex-generated shell snapshots under `~/.codex/shell_snapshots/*.sh`, which means the affected shell inherited it from its parent runtime rather than from TeamCow itself.

### How to confirm

Check the current shell:

```bash
printf 'ELECTRON_RUN_AS_NODE=%s\n' "$ELECTRON_RUN_AS_NODE"
env | rg '^ELECTRON_'
```

Check whether a clean shell still has it:

```bash
env -i HOME="$HOME" USER="$USER" PATH="/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin" \
  /bin/zsh -dfc 'printf "zsh-df:%s\n" "$ELECTRON_RUN_AS_NODE"'
```

If the clean shell prints an empty value, the variable is inherited from the parent process, not your shell config.

### Project-side mitigation

`apps/desktop/scripts/run-electron-vite.mjs` explicitly removes `ELECTRON_RUN_AS_NODE` before invoking `electron-vite`, and `apps/desktop/package.json` routes `dev` and `preview` through that wrapper.

### Manual workaround

If you need to bypass the inherited environment for ad hoc testing:

```bash
/usr/bin/env -u ELECTRON_RUN_AS_NODE yarn workspace @teamcow/desktop dev
```

### Notes

- This issue is environment-specific and should not be treated as a TeamCow application bug by default.
- If it appears again outside Codex-driven shells, inspect the parent terminal or launcher rather than the repo first.
