# Security Policy

## Supported versions

TeamCow is currently pre-1.0. Security fixes are applied to the latest release and the current `main` branch only. Older snapshots are not supported.

## Reporting a vulnerability

Please do not disclose a suspected vulnerability in a public issue, discussion, pull request, log, or screenshot.

After the public GitHub repository is created, enable **Private vulnerability reporting** in the repository security settings. Use **Security → Advisories → Report a vulnerability** to send the maintainers:

- the affected version or commit;
- impact and realistic attack scenario;
- reproduction steps or a minimal proof of concept;
- relevant platform and provider details;
- any suggested mitigation.

Remove API keys, provider credentials, local user paths, user project source, conversation content, and the TeamCow SQLite database from the report unless the maintainers explicitly request a secure sample.

The maintainers will acknowledge a valid report, investigate it privately, and coordinate disclosure after a fix is available. Response times are best effort while the project is pre-1.0.

## Security scope

Particularly relevant areas include:

- renderer-to-main IPC validation and preload isolation;
- worktree and filesystem boundary enforcement;
- provider process invocation, arguments, environment redaction, and output parsing;
- terminal and Git command execution;
- update download and installation behavior;
- leakage of credentials, user projects, local databases, attachments, or logs.

Provider behavior or account issues that reproduce outside TeamCow should be reported to the corresponding provider through its own security channel.
