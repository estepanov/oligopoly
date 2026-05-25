# Cursor configuration

## Cursor Team Kit

This repository includes the official [Cursor Team Kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit) under `.cursor/plugins/cursor-team-kit` (MIT), vendored from `cursor/plugins` on GitHub so paths stay stable for Cloud Agents and for teams that prefer version-controlled tooling.

- **Cursor Desktop:** you can still install or refresh the marketplace plugin with `/add-plugin cursor-team-kit` (see the upstream README). After installing, use **Developer: Reload Window** if skills or commands do not appear immediately.
- **Skills and agents:** live under `.cursor/plugins/cursor-team-kit/skills/` and `.cursor/plugins/cursor-team-kit/agents/`. Open the `SKILL.md` (or agent `.md`) you need and follow it in chat.
- **Rules:** the kit ships two `alwaysApply` rules. Copies live in `.cursor/rules/` so Cursor loads them for this workspace. If you bump the vendored plugin, re-copy from `plugins/cursor-team-kit/rules/` when those files change.

Upstream version is declared in `.cursor/plugins/cursor-team-kit/.cursor-plugin/plugin.json`.
