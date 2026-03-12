import {
  executePromQL,
  executePromQLRange,
  getLabelNames,
  getLabelValues,
  getMetricNames,
  getSeries,
  searchMetricNames,
} from '@/api/metrics'
import ensureWebMcpInstance from './webmcp-instance'

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

const registerMetricsTools = (instance: any) => {
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
}

// Best-effort registration at app startup
;(async () => {
  if (registered) return
  const instance = await ensureWebMcpInstance()
  if (!instance) return
  registerMetricsTools(instance)
  registered = true
})()
