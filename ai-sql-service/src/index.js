import express from 'express'
import cors from 'cors'
import fs from 'fs'

const app = express()

app.use(cors())
app.use(express.json({ limit: '1mb' }))

const { CLAUDE_API_KEY, CLAUDE_MODEL: MODEL_FROM_ENV, ANTHROPIC_VERSION: VERSION_FROM_ENV } = process.env
const PORT = process.env.PORT || 8787
const CLAUDE_MODEL = MODEL_FROM_ENV || 'claude-haiku-4-5-20251001'
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = VERSION_FROM_ENV || '2023-06-01'

// Load system prompt template from file so it can be edited without code changes.
let SYSTEM_PROMPT_TEMPLATE = ''
try {
  const url = new URL('../prompt/system-prompt.txt', import.meta.url)
  SYSTEM_PROMPT_TEMPLATE = fs.readFileSync(url, 'utf8')
} catch {
  SYSTEM_PROMPT_TEMPLATE = 'You are an expert SQL assistant.\nDatabase schema:\n{SCHEMA}'
}

/**
 * 生成 schema 文本，用于拼到 system prompt 里
 * schema 结构示例：
 * {
 *   database: "greptime-public",
 *   tables: [
 *     {
 *       name: "metrics",
 *       columns: [
 *         { name: "host", dataType: "string", semanticType: "TAG" },
 *         { name: "ts", dataType: "timestamp", semanticType: "TIMESTAMP" },
 *         { name: "cpu_usage", dataType: "double", semanticType: "FIELD" }
 *       ],
 *       timeIndex: "ts"
 *     }
 *   ]
 * }
 */
function buildSchemaText(schema) {
  if (!schema) return 'No schema provided.'

  const { database, tables } = schema
  const lines = []

  if (database) {
    lines.push(`Current database: ${database}`)
    lines.push('')
  }

  if (!Array.isArray(tables) || tables.length === 0) {
    lines.push('No tables described.')
    return lines.join('\n')
  }

  lines.push('Tables:')
  tables.forEach((table, idx) => {
    if (!table || !table.name) return

    const tableIndex = idx + 1
    const headerParts = [`${tableIndex}) ${table.name}`]
    if (table.timeIndex) {
      headerParts.push(`(time index: ${table.timeIndex})`)
    }
    lines.push(headerParts.join(' '))

    const cols = Array.isArray(table.columns) ? table.columns : []
    cols.forEach((col) => {
      if (!col || !col.name) return
      const parts = [col.name]
      if (col.dataType) parts.push(col.dataType)
      if (col.semanticType) parts.push(col.semanticType)
      lines.push(`   - ${parts.join(' ')}`)
    })

    if (cols.length === 0) {
      lines.push('   - (no columns described)')
    }
  })

  return lines.join('\n')
}

function buildSystemPrompt(schema, dialect = 'greptime') {
  const schemaText = buildSchemaText(schema)
  return SYSTEM_PROMPT_TEMPLATE.replace(/{DIALECT}/g, dialect).replace('{SCHEMA}', schemaText)
}

function normalizeSqlOutput(raw) {
  if (!raw) return ''
  let text = String(raw).trim()

  // 去掉 ```sql ... ``` 等 Markdown 包裹
  if (text.startsWith('```')) {
    const firstLineEnd = text.indexOf('\n')
    if (firstLineEnd !== -1) {
      text = text.slice(firstLineEnd + 1)
    }
    if (text.endsWith('```')) {
      text = text.slice(0, -3)
    }
    text = text.trim()
  }

  return text
}

async function callClaude(systemPrompt, userPrompt) {
  if (!CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY environment variable is not set')
  }

  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userPrompt,
          },
        ],
      },
    ],
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Claude API request failed with status ${response.status}: ${errorText || response.statusText}`)
  }

  const data = await response.json()

  // data.content 是一个 content block 数组，从中抽取 text block
  const contentBlocks = Array.isArray(data.content) ? data.content : []
  const combined = contentBlocks
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')

  return normalizeSqlOutput(combined)
}

// 简单健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// 主接口：生成 SQL
app.post('/ai/generate-sql', async (req, res) => {
  const { userPrompt, schema } = req.body || {}

  if (!userPrompt || typeof userPrompt !== 'string') {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'userPrompt is required and must be a string' },
    })
  }

  if (!schema || typeof schema !== 'object') {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'schema is required and must be an object' },
    })
  }

  const systemPrompt = buildSystemPrompt(schema, 'greptime')

  try {
    const startedAt = Date.now()
    const sql = await callClaude(systemPrompt, userPrompt)
    const latencyMs = Date.now() - startedAt

    if (!sql) {
      return res.status(502).json({
        error: {
          code: 'EMPTY_RESPONSE',
          message: 'Claude returned an empty response when generating SQL',
        },
      })
    }

    return res.json({
      sql,
      latencyMs,
      model: CLAUDE_MODEL,
    })
  } catch (err) {
    console.error('Error generating SQL with Claude:', err)
    return res.status(502).json({
      error: {
        code: 'LLM_ERROR',
        message: 'Failed to generate SQL from Claude',
      },
    })
  }
})

app.listen(PORT, () => {
  console.log(`AI SQL service listening on http://localhost:${PORT}`)
})
