import {
  executePromQL,
  executePromQLRange,
  getLabelNames,
  getLabelValues,
  getMetricNames,
  getSeries,
  searchMetricNames,
} from '@/api/metrics'

// WebMCP is provided globally via a <script> tag in index.html
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const WebMCP: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const window: any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mcpInstance: any | null = null
let registered = false

const toErrorMessage = (err: unknown) => {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

const okText = (payload: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(payload) }],
})

const errText = (payload: Record<string, any>) => okText({ ok: false, ...payload })

const ensureWebMcpInstance = async () => {
  if (mcpInstance) return mcpInstance
  if (window?.__webmcp) {
    mcpInstance = window.__webmcp
    return mcpInstance
  }
  if (typeof WebMCP !== 'function') {
    // WebMCP script not ready yet; fail quietly
    return null
  }

  try {
    const instance = new WebMCP({ position: 'bottom-right' })
    window.__webmcp = instance
    mcpInstance = instance
    return instance
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e)
    return null
  }
}

const registerMetricsToolsAndPrompts = (instance: any) => {
  instance.registerTool(
    'listMetrics',
    'List available metric names in the current dashboard database',
    { type: 'object', properties: {} },
    async () => {
      try {
        const resp = await getMetricNames()
        return okText({ ok: true, metrics: resp?.data || [] })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        return errText({ error: 'Failed to list metrics', details: toErrorMessage(e) })
      }
    }
  )

  instance.registerTool(
    'searchMetrics',
    'Search metric names (server-side) by a fuzzy string. Returns matching metric names',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Fuzzy string to match metric names' },
      },
      required: ['query'],
    },
    async (args: { query?: string }) => {
      const query = (args?.query || '').trim()
      if (!query) return errText({ error: 'Missing required parameter: query' })
      try {
        const resp = await searchMetricNames(query)
        return okText({ ok: true, query, metrics: resp?.data || [] })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        return errText({ error: 'Failed to search metrics', query, details: toErrorMessage(e) })
      }
    }
  )

  instance.registerTool(
    'getMetricLabelNames',
    'Get label names (excluding __name__) for a metric selector or metric name',
    {
      type: 'object',
      properties: {
        match: {
          type: 'string',
          description: 'Metric name or series selector (e.g. cpu_usage or {__name__="cpu_usage"})',
        },
      },
    },
    async (args: { match?: string }) => {
      const match = (args?.match || '').trim()
      try {
        const resp = await getLabelNames(match || undefined)
        const labels = (resp?.data || []).filter((n: string) => n !== '__name__')
        return okText({ ok: true, match: match || null, labels })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        return errText({ error: 'Failed to get label names', match: match || null, details: toErrorMessage(e) })
      }
    }
  )

  instance.registerTool(
    'getMetricLabelValues',
    'Get label values for a given label name, optionally filtered by metric selector/name',
    {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Label name (e.g. instance)' },
        match: {
          type: 'string',
          description: 'Optional metric name or series selector to filter values',
        },
      },
      required: ['label'],
    },
    async (args: { label?: string; match?: string }) => {
      const label = (args?.label || '').trim()
      const match = (args?.match || '').trim()
      if (!label) return errText({ error: 'Missing required parameter: label' })
      try {
        const resp = await getLabelValues(label, match || undefined)
        return okText({ ok: true, label, match: match || null, values: resp?.data || [] })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        return errText({
          error: 'Failed to get label values',
          label,
          match: match || null,
          details: toErrorMessage(e),
        })
      }
    }
  )

  instance.registerTool(
    'queryPromqlInstant',
    'Execute a PromQL instant query in the current dashboard database',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'PromQL query string' },
        time: {
          type: 'string',
          description: 'Optional Unix timestamp (seconds) as string for evaluation time',
        },
      },
      required: ['query'],
    },
    async (args: { query?: string; time?: string }) => {
      const query = (args?.query || '').trim()
      const time = (args?.time || '').trim()
      if (!query) return errText({ error: 'Missing required parameter: query' })
      try {
        const resp = await executePromQL(query, time || undefined)
        return okText({ ok: true, query, time: time || null, data: resp?.data || null })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        return errText({
          error: 'Failed to execute PromQL instant query',
          query,
          time: time || null,
          details: toErrorMessage(e),
        })
      }
    }
  )

  instance.registerTool(
    'queryPromqlRange',
    'Execute a PromQL range query in the current dashboard database',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'PromQL query string' },
        start: { type: 'string', description: 'Unix timestamp (seconds) start' },
        end: { type: 'string', description: 'Unix timestamp (seconds) end' },
        step: { type: 'string', description: 'Step in seconds' },
      },
      required: ['query', 'start', 'end', 'step'],
    },
    async (args: { query?: string; start?: string; end?: string; step?: string }) => {
      const query = (args?.query || '').trim()
      const start = (args?.start || '').trim()
      const end = (args?.end || '').trim()
      const step = (args?.step || '').trim()
      if (!query) return errText({ error: 'Missing required parameter: query' })
      if (!start || !end || !step)
        return errText({ error: 'Missing required parameters: start/end/step', query, start, end, step })
      try {
        const resp = await executePromQLRange(query, start, end, step)
        return okText({ ok: true, query, start, end, step, data: resp?.data || null })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        return errText({
          error: 'Failed to execute PromQL range query',
          query,
          start,
          end,
          step,
          details: toErrorMessage(e),
        })
      }
    }
  )

  instance.registerTool(
    'getSeries',
    'Query series for a Prometheus match selector',
    {
      type: 'object',
      properties: {
        match: { type: 'string', description: 'Series selector string, e.g. {__name__="cpu_usage"}' },
        start: { type: 'string', description: 'Optional Unix timestamp (seconds) start' },
        end: { type: 'string', description: 'Optional Unix timestamp (seconds) end' },
      },
      required: ['match'],
    },
    async (args: { match?: string; start?: string; end?: string }) => {
      const match = (args?.match || '').trim()
      const start = (args?.start || '').trim()
      const end = (args?.end || '').trim()
      if (!match) return errText({ error: 'Missing required parameter: match' })
      try {
        const resp = await getSeries(match, start || undefined, end || undefined)
        return okText({ ok: true, match, start: start || null, end: end || null, data: resp?.data || null })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        return errText({
          error: 'Failed to get series',
          match,
          start: start || null,
          end: end || null,
          details: toErrorMessage(e),
        })
      }
    }
  )

  instance.registerPrompt(
    'metrics-help',
    'Guidance for metric queries in GreptimeDB (PromQL, instant/range, and Prometheus-compatible HTTP API)',
    [],
    () => {
      const text = `You are assisting with GreptimeDB metric queries in the dashboard.

Key rules:
- Metric queries MUST use PromQL.
- Choose the correct query type:
  - Instant query: current value at a timestamp (table-like). Use PromQL instant query.
  - Range query: time series over a window. Use PromQL range query.

GreptimeDB implements Prometheus-compatible HTTP APIs under /v1/prometheus/:
- Instant queries: /api/v1/query
- Range queries: /api/v1/query_range
- Series: /api/v1/series
- Label names: /api/v1/labels
- Label values: /api/v1/label/<label_name>/values

When you need metadata:
- Use listMetrics/searchMetrics to find metric names.
- Use getMetricLabelNames/getMetricLabelValues to explore labels.
- Use getSeries to discover concrete series selectors.

When executing:
- Use queryPromqlInstant for instant.
- Use queryPromqlRange for range (requires start/end/step in seconds).
`
      return {
        messages: [{ role: 'user', content: { type: 'text', text } }],
      }
    }
  )

  instance.registerPrompt(
    'metrics-generate-promql',
    'Generate PromQL for a metric task (compatible with instant and range queries)',
    [
      { name: 'task', description: 'User goal described in natural language', required: true },
      {
        name: 'mode',
        description: 'Query mode: "instant" or "range". If omitted, choose the best mode and explain briefly.',
        required: false,
      },
      {
        name: 'metric_hint',
        description: 'Optional metric name(s) or partial name to guide selection',
        required: false,
      },
    ],
    (args: Record<string, any>) => {
      const task = String(args?.task || '').trim()
      const mode = String(args?.mode || '').trim()
      const metricHint = String(args?.metric_hint || '').trim()
      const parts = [
        `You are a PromQL expert helping query GreptimeDB metrics in the dashboard.

Requirements:
- Output ONLY PromQL (no markdown, no explanations in the output).
- Ensure the query is valid PromQL.
- If mode is "instant", produce a query suitable for /api/v1/query.
- If mode is "range", produce a query suitable for /api/v1/query_range.
- Prefer filters on labels (e.g. instance, job) when relevant.

Task:
${task}
`,
      ]
      if (mode) parts.push(`Mode:\n${mode}\n`)
      if (metricHint) parts.push(`Metric hint:\n${metricHint}\n`)
      const text = parts.join('\n')
      return { messages: [{ role: 'user', content: { type: 'text', text } }] }
    }
  )

  instance.registerPrompt(
    'metrics-debug-promql',
    'Debug a PromQL query that errors or returns empty results',
    [
      { name: 'promql', description: 'The PromQL query to debug', required: true },
      { name: 'symptom', description: 'What went wrong (error message or empty result)', required: true },
    ],
    (args: Record<string, any>) => {
      const promql = String(args?.promql || '').trim()
      const symptom = String(args?.symptom || '').trim()
      const text = `You are debugging PromQL against GreptimeDB Prometheus-compatible APIs.

Given the query and symptom, propose a step-by-step debugging plan using these tools:
- listMetrics / searchMetrics
- getMetricLabelNames / getMetricLabelValues
- getSeries
- queryPromqlInstant / queryPromqlRange

Focus on:
- metric name typos
- label name/value mismatches
- incorrect selector shape
- range vs instant mismatch
- start/end/step formatting (seconds)

PromQL:
${promql}

Symptom:
${symptom}
`
      return { messages: [{ role: 'user', content: { type: 'text', text } }] }
    }
  )
}

// Best-effort registration at app startup
;(async () => {
  if (registered) return
  const instance = await ensureWebMcpInstance()
  if (!instance) return
  registerMetricsToolsAndPrompts(instance)
  registered = true
})()
