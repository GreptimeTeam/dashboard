/**
 * Adapter to convert ClickHouse query parameters to GreptimeDB SQL API format
 * ClickHouse plugin sends: ?query=SELECT...&database=default
 * GreptimeDB expects: ?sql=SELECT...&db=...
 */

const originalFetch = window.fetch

function getUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function getMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method
  if (typeof input === 'object' && 'method' in input) return input.method
  return 'GET'
}

function findAuthHeader(headers: Headers): { key: string; value: string } | null {
  const direct = headers.get('authorization') || headers.get('Authorization')
  if (direct) return { key: 'Authorization', value: direct }
  let found: { key: string; value: string } | null = null
  headers.forEach((value, key) => {
    if (key.toLowerCase() === 'authorization' && !found) {
      found = { key, value }
    }
  })
  return found
}

window.fetch = async function fetchAdapter(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = getUrlString(input)
  const method = getMethod(input, init)

  const isClickHouseSqlRequest =
    method === 'GET' && (url.includes('/v1/sql') || url.includes('/greptime/v1/sql')) && url.includes('?query=')

  if (isClickHouseSqlRequest) {
    try {
      const urlObj = new URL(url, window.location.origin)
      const query = urlObj.searchParams.get('query')
      const database = urlObj.searchParams.get('database')

      if (!query || query.trim().length === 0) {
        return originalFetch(input, init)
      }

      let sqlQuery = query
      if (sqlQuery.toUpperCase().includes('FORMAT JSON')) {
        sqlQuery = sqlQuery.replace(/\s+FORMAT\s+JSON\s*$/i, '').trim()
      }

      const headers = new Headers(init?.headers)
      const auth = findAuthHeader(headers)
      const dbName = headers.get('x-greptime-db-name')
      const effectiveDatabase = dbName || (database && database !== 'default' ? database : null)

      const newUrl = new URL(urlObj.pathname, window.location.origin)
      newUrl.searchParams.set('sql', sqlQuery)
      if (effectiveDatabase) {
        newUrl.searchParams.set('db', effectiveDatabase)
      }

      const newHeaders: HeadersInit = {}
      if (auth?.value) {
        newHeaders[auth.key] = auth.value
      }
      if (dbName) {
        newHeaders['x-greptime-db-name'] = dbName
      }

      const response = await originalFetch(newUrl.toString(), {
        method: 'GET',
        headers: newHeaders,
      })

      if (!response.ok) {
        return response
      }

      const greptimeData = await response.json()
      const output = greptimeData.output?.[0]
      if (!output || !output.records) {
        return new Response(
          JSON.stringify({
            data: [],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      const { records } = output
      const columnSchemas = records.schema?.column_schemas || []
      const rows = records.rows || []

      if (columnSchemas.length === 0 || rows.length === 0) {
        return new Response(
          JSON.stringify({
            data: [],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      const columnNames = columnSchemas.map((col: any) => col.name)
      const currentTime = new Date().toISOString()
      const data = rows.map((row: any[], rowIndex: number) => {
        const obj: Record<string, any> = { time: currentTime }

        if (columnNames.length === 1 && rows.length === 1) {
          const firstColName = columnNames[0]?.toLowerCase() || ''
          if (firstColName.includes('count') || firstColName === 'count') {
            obj.log_count = Number(row[0]) || 0
          } else {
            obj.log_count = Number(row[0]) || 0
          }
        } else {
          obj.log_count = rowIndex
        }

        columnNames.forEach((colName: string, index: number) => {
          obj[colName] = row[index]
        })
        return obj
      })

      return new Response(
        JSON.stringify({
          data,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    } catch (error) {
      console.error('GreptimeDB SQL adapter error:', error)
      return originalFetch(input, init)
    }
  }

  return originalFetch(input, init)
}
