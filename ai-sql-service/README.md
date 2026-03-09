# AI SQL Service (Node.js Prototype)

Simple local Node.js API service that calls Claude to generate SQL from natural language, using the current database schema as context.

## Requirements

- Node.js 18+ (for built-in `fetch`)
- A Claude API key (`CLAUDE_API_KEY`)

## Install & Run

In the `ai-sql-service` directory:

```bash
npm install

CLAUDE_API_KEY=your_key_here \
CLAUDE_MODEL=claude-3-5-sonnet-20241022 \
node src/index.js
```

By default the service listens on `http://localhost:8787`.

You can change:

- `PORT` via `PORT` env var
- `CLAUDE_MODEL` via `CLAUDE_MODEL` env var
- `ANTHROPIC_VERSION` via `ANTHROPIC_VERSION` env var (defaults to `2023-06-01`)

## API

### `POST /ai/generate-sql`

Generate SQL from a natural language prompt and a database schema description.

**Request body**

```json
{
  "userPrompt": "查询最近 7 天 CPU 使用率最高的 10 台机器",
  "schema": {
    "database": "greptime-public",
    "tables": [
      {
        "name": "metrics",
        "timeIndex": "ts",
        "columns": [
          { "name": "host", "dataType": "string", "semanticType": "TAG" },
          { "name": "ts", "dataType": "timestamp", "semanticType": "TIMESTAMP" },
          { "name": "cpu_usage", "dataType": "double", "semanticType": "FIELD" },
          { "name": "mem_usage", "dataType": "double", "semanticType": "FIELD" }
        ]
      }
    ]
  }
}
```

**Response (success)**

```json
{
  "sql": "SELECT host, MAX(cpu_usage) AS max_cpu_usage\nFROM greptime-public.\"metrics\"\nWHERE ts >= now() - INTERVAL '7 days'\nGROUP BY host\nORDER BY max_cpu_usage DESC\nLIMIT 10;",
  "latencyMs": 1234,
  "model": "claude-3-5-sonnet-20241022"
}
```

**Response (error)**

```json
{
  "error": {
    "code": "LLM_ERROR",
    "message": "Failed to generate SQL from Claude"
  }
}
```

## Notes

- No authentication is implemented; this is a simple local prototype.
- The service does **not** connect to your database. It only uses the schema you send in each request, which helps keep different users / connections isolated by schema.

