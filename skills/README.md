# Agent Skills

This repository ships [Agent Skills](https://agentskills.io) for AI coding assistants (Cursor, Claude Code, GitHub Copilot, Codex, Gemini CLI, and others).

## Available skills

| Skill | Description |
|-------|-------------|
| [perses-dashboard](./perses-dashboard/) | Generate Perses dashboard or panel JSON for GreptimeDB (SQL / PromQL, logs, traces) |

## Install `perses-dashboard`

### skills CLI (recommended)

Works across Cursor, Claude Code, Copilot, Codex, and other hosts:

```bash
# Interactive — pick skill and agent
npx skills add GreptimeTeam/dashboard -s perses-dashboard

# Non-interactive
npx skills add GreptimeTeam/dashboard -s perses-dashboard -y
npx skills add GreptimeTeam/dashboard -s perses-dashboard -a cursor -y
```

### GitHub CLI

Requires [GitHub CLI](https://cli.github.com/) v2.90.0+:

```bash
gh skill install GreptimeTeam/dashboard perses-dashboard
gh skill install GreptimeTeam/dashboard perses-dashboard --agent cursor
```

### Manual install

Copy [skills/perses-dashboard](./perses-dashboard/) into your agent’s skills directory:

| Agent host | Typical path |
|------------|----------------|
| Cursor | `.cursor/skills/perses-dashboard/` (project) or `~/.cursor/skills/perses-dashboard/` (user) |
| Claude Code | `.claude/skills/perses-dashboard/` |
| GitHub Copilot / VS Code | `.github/skills/perses-dashboard/` |
| Codex / generic | `.agents/skills/perses-dashboard/` |

```bash
mkdir -p .cursor/skills   # or .claude/skills, .github/skills, etc.
cp -r skills/perses-dashboard .cursor/skills/
```

Source: bundled at `skills/perses-dashboard/` in this repository.

## Usage

In your AI agent chat, ask to create or edit a Perses dashboard, for example:

- "Create a Perses dashboard for CPU metrics from `public.cpu_metrics`"
- "Generate a single StatChart panel JSON for log line count"

The agent loads `perses-dashboard` when the task matches the skill description. See [perses-dashboard/SKILL.md](./perses-dashboard/SKILL.md) for full workflow and constraints.

## In-app guide

Open **Dashboard → Visualization** in GreptimeDB Dashboard; use the sidebar **Install** link for the GitHub install guide.
