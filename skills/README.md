# Agent Skills

This repository ships [Agent Skills](https://agentskills.io) for AI coding assistants (Cursor, Claude Code, GitHub Copilot, Codex, Gemini CLI, and others).

## Available skills

| Skill | Description |
|-------|-------------|
| [greptimedb-perses-dashboard](./greptimedb-perses-dashboard/) | Generate Perses dashboard or panel JSON for GreptimeDB (SQL / PromQL, logs, traces) |

## Install `greptimedb-perses-dashboard`

### skills CLI (recommended)

```bash
npx skills add GreptimeTeam/dashboard -s greptimedb-perses-dashboard -y
```

Add `-a cursor` (or another agent name) to target a specific host.

### Manual install

Copy [skills/greptimedb-perses-dashboard](./greptimedb-perses-dashboard/) into your agent’s skills directory:

| Agent host | Path |
|------------|------|
| Cursor | `.cursor/skills/greptimedb-perses-dashboard/` |
| Claude Code | `.claude/skills/greptimedb-perses-dashboard/` |
| GitHub Copilot / VS Code | `.github/skills/greptimedb-perses-dashboard/` |
| Codex / generic | `.agents/skills/greptimedb-perses-dashboard/` |

```bash
cp -r skills/greptimedb-perses-dashboard .cursor/skills/
```

## Usage

In your AI agent chat, ask to create or edit a Perses dashboard, for example:

- "Create a Perses dashboard for CPU metrics from `public.cpu_metrics`"
- "Generate a single StatChart panel JSON for log line count"

The agent loads `greptimedb-perses-dashboard` when the task matches the skill description. See [greptimedb-perses-dashboard/SKILL.md](./greptimedb-perses-dashboard/SKILL.md) for full workflow and constraints.

## In-app guide

Open **Dashboard → Visualization** in GreptimeDB Dashboard; use the sidebar **Install** link for the install guide.
