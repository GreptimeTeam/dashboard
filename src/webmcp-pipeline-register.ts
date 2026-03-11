import {
  create,
  list as listPipes,
  getByName,
  debug as debugPipelineConfig,
  debugContent as debugPipelineWithDataApi,
  getPipelineDDL as getPipelineDDLApi,
} from '@/api/pipeline'

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

const registerPipelineTools = (instance: any) => {
  instance.registerTool(
    'listPipelines',
    'List log pipelines (name and version) from greptime_private.pipelines',
    { type: 'object', properties: {} },
    async () => {
      try {
        const pipelines = await listPipes()
        return okText({ ok: true, pipelines })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        return errText({ error: 'Failed to list pipelines', details: toErrorMessage(e) })
      }
    }
  )

  instance.registerTool(
    'getPipeline',
    'Get the latest version of a pipeline by name, including YAML content',
    {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Pipeline name' },
      },
      required: ['name'],
    },
    async (args: { name?: string }) => {
      const name = (args?.name || '').trim()
      if (!name) return errText({ error: 'Missing required parameter: name' })
      try {
        const pipeline = await getByName(name)
        return okText({ ok: true, pipeline })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        return errText({ error: 'Failed to get pipeline', name, details: toErrorMessage(e) })
      }
    }
  )

  instance.registerTool(
    'createOrUpdatePipeline',
    'Create or update a pipeline from YAML content',
    {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Pipeline name' },
        content: { type: 'string', description: 'Pipeline YAML content' },
      },
      required: ['name', 'content'],
    },
    async (args: { name?: string; content?: string }) => {
      const name = (args?.name || '').trim()
      const content = (args?.content || '').trim()
      if (!name || !content) {
        return errText({ error: 'Missing required parameters: name and/or content' })
      }
      try {
        await create({ name, content, version: '' })
        const pipeline = await getByName(name)
        return okText({ ok: true, pipeline })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        return errText({ error: 'Failed to create or update pipeline', name, details: toErrorMessage(e) })
      }
    }
  )

  instance.registerTool(
    'debugPipelineConfig',
    'Dry-run a pipeline configuration with sample JSON payload (pipeline definition only)',
    {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Pipeline name (for labeling/logical grouping)' },
        content: {
          type: 'string',
          description: 'Pipeline JSON/YAML content string; will be JSON.parsed before sending',
        },
      },
      required: ['name', 'content'],
    },
    async (args: { name?: string; content?: string }) => {
      const name = (args?.name || '').trim()
      const content = (args?.content || '').trim()
      if (!name || !content) {
        return errText({ error: 'Missing required parameters: name and/or content' })
      }
      try {
        const resp = await debugPipelineConfig(name, content)
        return okText({ ok: true, name, result: resp?.data || null })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        return errText({ error: 'Failed to dry-run pipeline config', name, details: toErrorMessage(e) })
      }
    }
  )

  instance.registerTool(
    'debugPipelineWithData',
    'Dry-run a pipeline with sample log data via /v1/events/pipelines/dryrun',
    {
      type: 'object',
      properties: {
        pipeline: { type: 'string', description: 'Pipeline definition string (YAML or JSON)' },
        data: { type: 'string', description: 'Original log or NDJSON data to be processed' },
        contentType: {
          type: 'string',
          description: 'Payload Content-Type, e.g. application/x-ndjson or text/plain',
        },
      },
      required: ['pipeline', 'data'],
    },
    async (args: { pipeline?: string; data?: string; contentType?: string }) => {
      const pipeline = (args?.pipeline || '').trim()
      const data = (args?.data || '').trim()
      const contentType = (args?.contentType || 'application/x-ndjson').trim()
      if (!pipeline || !data) {
        return errText({ error: 'Missing required parameters: pipeline and/or data' })
      }
      try {
        const resp = await debugPipelineWithDataApi(pipeline, data, contentType)
        return okText({ ok: true, pipeline, contentType, result: resp?.data || null })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        return errText({
          error: 'Failed to dry-run pipeline with data',
          pipeline,
          contentType,
          details: toErrorMessage(e),
        })
      }
    }
  )

  instance.registerTool(
    'getPipelineDDL',
    'Generate CREATE TABLE DDL for a pipeline output table',
    {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Pipeline name' },
        table: { type: 'string', description: 'Target table name' },
      },
      required: ['name', 'table'],
    },
    async (args: { name?: string; table?: string }) => {
      const name = (args?.name || '').trim()
      const table = (args?.table || '').trim()
      if (!name || !table) {
        return errText({ error: 'Missing required parameters: name and/or table' })
      }
      try {
        const sql = await getPipelineDDLApi(name, table)
        return okText({ ok: true, name, table, sql })
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e)
        return errText({ error: 'Failed to get pipeline DDL', name, table, details: toErrorMessage(e) })
      }
    }
  )
}

// Best-effort registration at app startup
;(async () => {
  if (registered) return
  const instance = await ensureWebMcpInstance()
  if (!instance) return
  registerPipelineTools(instance)
  registered = true
})()
