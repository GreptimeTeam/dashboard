import qs from 'qs'
import axios from 'axios'
import { useAppStore } from '@/store'

const analyzeStreamUrl = `/v1/sql/analyze/stream`

export type AnalyzeStreamEventName = 'metrics' | 'final' | 'canceled' | 'error'

export interface AnalyzeStreamStageMetric {
  stage: number
  node: number
  plan: unknown
}

export interface AnalyzeStreamPayload {
  seq: number
  state: AnalyzeStreamEventName | string
  partial: boolean
  elapsed_ms: number
  metrics?: AnalyzeStreamStageMetric[]
  output?: {
    records?: {
      schema: { column_schemas: Array<{ name: string; data_type: string }> }
      rows: unknown[][]
      total_rows?: number
    }
  }
  reason?: string
  code?: number
}

export interface AnalyzeStreamHandlers {
  onEvent: (event: AnalyzeStreamEventName, payload: AnalyzeStreamPayload) => void
  onError?: (error: Error) => void
}

const buildHeaders = () => {
  const appStore = useAppStore()
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'text/event-stream',
  }

  if (appStore.username || appStore.password) {
    const authHeader = appStore.authHeader || 'Authorization'
    headers[authHeader] = `Basic ${btoa(`${appStore.username}:${appStore.password}`)}`
  }

  if (appStore.userTimezone) {
    headers['x-greptime-timezone'] = appStore.userTimezone
  }

  return headers
}

const yieldToUi = () =>
  new Promise<void>((resolve) => {
    // Let Vue flush DOM updates between SSE events (esp. when a proxy delivers
    // multiple frames in one read, or a huge metrics payload blocks paint).
    requestAnimationFrame(() => {
      setTimeout(resolve, 0)
    })
  })

const parseFrameLines = (part: string): { eventName: string; data: string } | null => {
  if (!part.trim() || part.startsWith(':')) return null

  let eventName = 'message'
  const dataLines: string[] = []
  part.split('\n').forEach((line) => {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  })

  if (dataLines.length === 0) return null
  return { eventName, data: dataLines.join('\n') }
}

/**
 * POST-only SSE consumer for EXPLAIN ANALYZE VERBOSE live metrics.
 * Browser EventSource is GET-only, so this uses fetch + ReadableStream.
 */
export async function runSQLAnalyzeStream(
  sql: string,
  handlers: AnalyzeStreamHandlers,
  options?: { signal?: AbortSignal; snapshotIntervalMs?: number; database?: string }
): Promise<void> {
  const appStore = useAppStore()
  const base = axios.defaults.baseURL || ''
  const params = new URLSearchParams({
    db: options?.database || appStore.database,
  })
  if (options?.snapshotIntervalMs) {
    params.set('snapshot_interval_ms', String(options.snapshotIntervalMs))
  }

  const response = await fetch(`${base}${analyzeStreamUrl}?${params.toString()}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: qs.stringify({ sql }),
    signal: options?.signal,
  })

  if (!response.ok) {
    let message = `analyze/stream failed: ${response.status}`
    try {
      const body = await response.json()
      if (body?.error) message = body.error
    } catch {
      // ignore parse errors
    }
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('analyze/stream response has no body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const handleFrame = async (eventName: string, data: string) => {
    let payload: AnalyzeStreamPayload
    try {
      payload = JSON.parse(data) as AnalyzeStreamPayload
    } catch (error) {
      handlers.onError?.(error instanceof Error ? error : new Error(String(error)))
      return
    }

    const name = (eventName || payload.state || 'message') as AnalyzeStreamEventName
    if (name === 'metrics' || name === 'final' || name === 'canceled' || name === 'error') {
      handlers.onEvent(name, payload)
      await yieldToUi()
    }
  }

  const flushBuffer = async (text: string, isEof = false) => {
    const parts = (isEof ? `${text}\n\n` : text).split('\n\n')
    const rest = isEof ? '' : parts.pop() ?? ''

    await parts.reduce(async (prev, part) => {
      await prev
      if (options?.signal?.aborted) return
      const parsed = parseFrameLines(part)
      if (parsed) {
        await handleFrame(parsed.eventName, parsed.data)
      }
    }, Promise.resolve())

    return rest
  }

  const pump = async (): Promise<void> => {
    if (options?.signal?.aborted) return
    const { done, value } = await reader.read()
    if (done) {
      if (buffer.trim()) {
        await flushBuffer(buffer, true)
      }
      return
    }
    buffer = await flushBuffer(buffer + decoder.decode(value, { stream: true }))
    await pump()
  }

  try {
    await pump()
  } catch (error) {
    if (options?.signal?.aborted) return
    if (error instanceof Error && error.name === 'AbortError') return
    throw error
  }
}
