// Shared WebMCP prompts registration for GreptimeDB (SQL + PromQL context)
import ensureWebMcpInstance from './webmcp-instance'

let registered = false

const registerGreptimePrompts = (instance: any) => {
  instance.registerPrompt(
    'greptimeDB-help',
    'High-level guidance for querying GreptimeDB data (prefer SQL for most tasks, PromQL only for metrics)',
    [],
    () => {
      const text = `You are assisting with GreptimeDB queries inside the dashboard via MCP.

Global context:
- The backing system is GreptimeDB.
- For most tasks you should PREFER **SQL**.
- Only use PromQL when the user explicitly asks for PromQL/metrics, or when the task is clearly about time-series metrics.

When deciding between SQL and PromQL:
- Use **SQL** for:
  - Inspecting schemas and tables.
  - Reading or filtering rows from user tables.
  - Joining multiple tables or doing ad-hoc analytics on tabular data.
  - Most data exploration, unless the user clearly wants metrics.
- Use **PromQL** for:
  - Dashboards and charts over time-series metrics (e.g. cpu, memory, qps).
  - Instant or range evaluations of metric values.
  - Anything that would normally go through Prometheus-like metrics APIs.

Metric rules (PromQL):
- Metric queries MUST use PromQL, not SQL.
- Choose the correct query type:
  - Instant query: current value at a timestamp (table-like). Use PromQL instant query.
  - Range query: time series over a window. Use PromQL range query.

GreptimeDB implements Prometheus-compatible HTTP APIs under /v1/prometheus/:
- Instant queries: /api/v1/query
- Range queries: /api/v1/query_range
- Series: /api/v1/series
- Label names: /api/v1/labels
- Label values: /api/v1/label/<label_name>/values

When you need metric metadata (PromQL side):
- Use listMetrics/searchMetrics to find metric names.
- Use getMetricLabelNames/getMetricLabelValues to explore labels.
- Use getSeries to discover concrete series selectors.

When you need table data (SQL side):
- Prefer SQL and the SQL tools (e.g. listTables, getTableSchema, runSqlInDashboard).
- Generate standard SQL that GreptimeDB can execute over information_schema and user tables.`
      return {
        messages: [{ role: 'user', content: { type: 'text', text } }],
      }
    }
  )
}

;(async () => {
  if (registered) return
  const instance = await ensureWebMcpInstance()
  if (!instance) return

  registerGreptimePrompts(instance)
  registered = true
})()
