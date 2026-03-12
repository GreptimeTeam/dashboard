import editorAPI from '@/api/editor'
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

const registerWebmcpSql = async () => {
  if (registered) return

  const instance = await ensureWebMcpInstance()
  if (!instance) return

  instance.registerTool(
    'listTables',
    'List tables from the current database as seen in the dashboard sidebar',
    { type: 'object', properties: {} },
    async () => {
      try {
        const resp: any = await editorAPI.getTables()
        const records = resp?.output?.[0]?.records

        if (!records) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ ok: false, error: 'No table records returned from information_schema.tables' }),
              },
            ],
          }
        }

        const schemas = records.schema?.column_schemas || []
        const nameIndex = schemas.findIndex((s: { name: string }) => s.name === 'table_name')
        const typeIndex = schemas.findIndex((s: { name: string }) => s.name === 'table_type')

        const tables = (records.rows || []).map((row: string[]) => ({
          name: nameIndex >= 0 ? row[nameIndex] : row[0],
          tableType: typeIndex >= 0 ? row[typeIndex] : null,
        }))
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: true, tables }),
            },
          ],
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(error)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error: 'Failed to list tables via information_schema',
                details: toErrorMessage(error),
              }),
            },
          ],
        }
      }
    }
  )

  instance.registerTool(
    'getTableSchema',
    'Get schema information for a specific table in the current database',
    {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'The table name to get schema for' },
      },
      required: ['table'],
    },
    async (args: { table?: string }) => {
      const tableName = (args?.table || '').trim()
      if (!tableName) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: false, error: 'Missing required parameter: table' }),
            },
          ],
        }
      }

      try {
        const resp: any = await editorAPI.getTableByName(tableName)
        const records = resp?.output?.[0]?.records
        if (!records) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ ok: false, error: `Table not found or unable to load: ${tableName}` }),
              },
            ],
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: true, table: tableName, records }),
            },
          ],
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(error)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error: `Failed to fetch schema for table: ${tableName}`,
                details: toErrorMessage(error),
              }),
            },
          ],
        }
      }
    }
  )

  instance.registerTool(
    'showCreateTable',
    'Show CREATE TABLE statement for a given table in the current database',
    {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'The table name to show CREATE TABLE for (e.g. cpu_usage)',
        },
      },
      required: ['table'],
    },
    async (args: { table?: string }) => {
      const tableName = (args?.table || '').trim()
      if (!tableName) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: false, error: 'Missing required parameter: table' }),
            },
          ],
        }
      }

      try {
        const sql = `SHOW CREATE TABLE ${tableName}`
        const resp: any = await editorAPI.runSQL(sql)
        const records = resp?.output?.[0]?.records
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: true,
                sql,
                records: records || { error: `No CREATE TABLE information returned for table: ${tableName}` },
              }),
            },
          ],
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(error)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error: `Failed to run SHOW CREATE TABLE for: ${tableName}`,
                details: toErrorMessage(error),
              }),
            },
          ],
        }
      }
    }
  )

  instance.registerTool(
    'runSqlInDashboard',
    'Execute a SQL statement in the current dashboard database and return the last result metadata',
    {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'SQL statement to execute in the current dashboard database',
        },
      },
      required: ['sql'],
    },
    async (args: { sql?: string }) => {
      const sql = (args?.sql || '').trim()
      if (!sql) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: false, error: 'Missing required parameter: sql' }),
            },
          ],
        }
      }

      try {
        const resp: any = await editorAPI.runSQL(sql)
        const records = resp?.output?.[0]?.records
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: true,
                sql,
                records,
              }),
            },
          ],
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(error)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error: 'Failed to execute SQL via editor API',
                sql,
                details: toErrorMessage(error),
              }),
            },
          ],
        }
      }
    }
  )

  registered = true
}

export default registerWebmcpSql
;(async () => {
  try {
    await registerWebmcpSql()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to register WebMCP SQL tools', error)
  }
})()
