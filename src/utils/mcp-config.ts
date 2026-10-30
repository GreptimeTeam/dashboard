/**
 * Build GreptimeDB MCP server connection config from dashboard settings.
 * @see https://github.com/GreptimeTeam/greptimedb-mcp-server
 */

export const MCP_SERVER_REPO_URL = 'https://github.com/GreptimeTeam/greptimedb-mcp-server'
export const MCP_SERVER_NAME = 'greptimedb'

/** Demo / Query Guide only — dedicated AI MCP account, not the dashboard login. */
export const MCP_DEMO_USERNAME = 'greptime_mcp'
export const MCP_DEMO_PASSWORD = 'mcpsession'

export interface DashboardConnectionInput {
  host: string
  database: string
  username: string
  password: string
  timezone?: string
}

export interface McpConnectionParams {
  hostname: string
  mysqlPort: number
  httpPort: number
  httpProtocol: 'http' | 'https'
  database: string
  username: string
  password: string
  timezone: string
}

/**
 * Greptime MySQL protocol port (default 4002).
 * Do not derive from the dashboard Host HTTP port — Host is often the UI origin
 * (e.g. Vite :5173) or a reverse proxy, not Greptime's HTTP API (:4000).
 */
export function resolveMysqlPort(_httpPort: number): number {
  return 4002
}

export function parseDashboardHost(
  hostUrl: string
): Pick<McpConnectionParams, 'hostname' | 'mysqlPort' | 'httpPort' | 'httpProtocol'> {
  const raw = (hostUrl || '').trim() || 'http://localhost:4000'
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `http://${raw}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return {
      hostname: 'localhost',
      httpPort: 4000,
      mysqlPort: 4002,
      httpProtocol: 'http',
    }
  }
  const httpProtocol = url.protocol === 'https:' ? 'https' : 'http'
  const hostname = url.hostname || 'localhost'
  let httpPort: number
  if (url.port) {
    httpPort = Number(url.port)
  } else if (httpProtocol === 'https') {
    httpPort = 443
  } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
    httpPort = 4000
  } else {
    httpPort = 80
  }
  return {
    hostname,
    httpPort,
    mysqlPort: resolveMysqlPort(httpPort),
    httpProtocol,
  }
}

export function buildMcpConnectionParams(input: DashboardConnectionInput): McpConnectionParams {
  const parsed = parseDashboardHost(input.host)
  return {
    ...parsed,
    database: input.database?.trim() || 'public',
    username: input.username ?? '',
    password: input.password ?? '',
    timezone: input.timezone?.trim() || 'UTC',
  }
}

/**
 * Build MCP connection from dashboard host/db, with auth chosen by context.
 * Query Guide / demo: always use the dedicated AI account — never the UI login.
 * Self-hosted (guide off): use the current settings credentials.
 */
export function resolveMcpConnectionInput(
  connection: DashboardConnectionInput,
  options: { useDemoAccount: boolean }
): DashboardConnectionInput {
  if (!options.useDemoAccount) {
    return connection
  }
  return {
    ...connection,
    username: MCP_DEMO_USERNAME,
    password: MCP_DEMO_PASSWORD,
  }
}

/**
 * CLI args for greptimedb-mcp-server (same shape as GitHub demo).
 * Omits default MySQL port 4002, default HTTP API (http/4000), and empty auth
 * to stay close to the README sample.
 *
 * HTTP args matter for the pipeline / dashboard tools: a dashboard served over
 * HTTPS reaches GreptimeDB's HTTP API on 443, not on the default 4000.
 */
export function buildMcpArgs(params: McpConnectionParams): string[] {
  const args = ['--host', params.hostname, '--database', params.database]
  if (params.mysqlPort !== 4002) {
    args.push('--port', String(params.mysqlPort))
  }
  if (params.username) {
    args.push('--user', params.username)
  }
  if (params.password) {
    args.push('--password', params.password)
  }
  if (params.timezone && params.timezone !== 'UTC') {
    args.push('--timezone', params.timezone)
  }
  if (params.httpPort !== 4000) {
    args.push('--http-port', String(params.httpPort))
  }
  if (params.httpProtocol === 'https') {
    args.push('--http-protocol', 'https')
  }
  return args
}

/** Claude Desktop / Cursor-style mcpServers JSON (command + args). */
export function buildMcpServersJson(params: McpConnectionParams): string {
  const config = {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        command: 'greptimedb-mcp-server',
        args: buildMcpArgs(params),
      },
    },
  }
  return `${JSON.stringify(config, null, 2)}\n`
}

/** Full AI prompt: intro + mcpServers JSON + optional outro (copy this whole string). */
export function buildMcpSetupPrompt(configJson: string, intro: string, outro = ''): string {
  const parts = [String(intro ?? '').trim(), '', String(configJson ?? '').trimEnd()]
  const outroTrimmed = String(outro ?? '').trim()
  if (outroTrimmed) {
    parts.push('', outroTrimmed)
  }
  return `${parts.join('\n')}\n`
}

/** CLI invocation matching the generated connection. */
export function buildMcpCliCommand(params: McpConnectionParams): string {
  return ['greptimedb-mcp-server', ...buildMcpArgs(params)]
    .map((part) => (/^[a-zA-Z0-9_./:-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(' ')
}

export default buildMcpServersJson
