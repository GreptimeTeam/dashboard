# Agent Skills

This repository ships [Agent Skills](https://agentskills.io) for AI coding assistants (Cursor, Claude Code, GitHub Copilot, Codex, Gemini CLI, and others).

## Available skills

| Skill | Description |
|-------|-------------|
| [greptimedb-perses-dashboard](./greptimedb-perses-dashboard/) | Generate Perses dashboard or panel JSON for GreptimeDB (SQL / PromQL, logs, traces) |

## Install `greptimedb-perses-dashboard`

Copy the [greptimedb-perses-dashboard](./greptimedb-perses-dashboard/) directory into your agent's skills folder:

| Agent | Skills directory |
|-------|------------------|
| Cursor | `.cursor/skills/greptimedb-perses-dashboard/` — see [Cursor Skills](https://cursor.com/docs/context/skills) |
| Claude Code | `.claude/skills/greptimedb-perses-dashboard/` — see [Claude Code skills](https://code.claude.com/docs/en/skills) |
| GitHub Copilot / VS Code | `.github/skills/greptimedb-perses-dashboard/` — see [VS Code agent skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills) |
| Codex / generic | `.agents/skills/greptimedb-perses-dashboard/` |

From a clone of this repository:

```bash
cp -r skills/greptimedb-perses-dashboard .cursor/skills/
```

Adjust the target path for your agent.

## Usage

In your AI agent chat, ask to create or edit a Perses dashboard, for example:

- "Create a Perses dashboard for CPU metrics from `public.cpu_metrics`"
- "Generate a single StatChart panel JSON for log line count"

The agent loads `greptimedb-perses-dashboard` when the task matches the skill description. See [greptimedb-perses-dashboard/SKILL.md](./greptimedb-perses-dashboard/SKILL.md) for full workflow and constraints.

## In-app guide

Open **Dashboard → Visualization** in GreptimeDB Dashboard; use the sidebar link for the install guide.
