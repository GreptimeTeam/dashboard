import { describe, expect, it } from 'vitest'
import {
  MCP_DEMO_PASSWORD,
  MCP_DEMO_USERNAME,
  buildMcpArgs,
  buildMcpCliCommand,
  buildMcpConnectionParams,
  buildMcpServersJson,
  buildMcpSetupPrompt,
  parseDashboardHost,
  resolveMcpConnectionInput,
  resolveMysqlPort,
} from './mcp-config'

describe('resolveMysqlPort', () => {
  it('always uses Greptime MySQL default 4002', () => {
    expect(resolveMysqlPort(4000)).toBe(4002)
    expect(resolveMysqlPort(5177)).toBe(4002)
    expect(resolveMysqlPort(80)).toBe(4002)
    expect(resolveMysqlPort(443)).toBe(4002)
  })
})

describe('parseDashboardHost', () => {
  it('parses local HTTP URL', () => {
    expect(parseDashboardHost('http://127.0.0.1:4000')).toEqual({
      hostname: '127.0.0.1',
      httpPort: 4000,
      mysqlPort: 4002,
      httpProtocol: 'http',
    })
  })

  it('defaults localhost without port to 4000/4002', () => {
    expect(parseDashboardHost('http://localhost')).toEqual({
      hostname: 'localhost',
      httpPort: 4000,
      mysqlPort: 4002,
      httpProtocol: 'http',
    })
  })

  it('parses https cloud host without port', () => {
    expect(parseDashboardHost('https://example.greptime.cloud')).toEqual({
      hostname: 'example.greptime.cloud',
      httpPort: 443,
      mysqlPort: 4002,
      httpProtocol: 'https',
    })
  })

  it('adds http scheme when missing', () => {
    expect(parseDashboardHost('db.example.com:4000').hostname).toBe('db.example.com')
    expect(parseDashboardHost('db.example.com:4000').httpPort).toBe(4000)
  })
})

describe('buildMcpConnectionParams', () => {
  it('fills defaults for empty database and timezone', () => {
    const params = buildMcpConnectionParams({
      host: 'http://localhost:4000',
      database: '',
      username: 'root',
      password: 'secret',
    })
    expect(params.database).toBe('public')
    expect(params.timezone).toBe('UTC')
    expect(params.username).toBe('root')
    expect(params.password).toBe('secret')
  })
})

describe('resolveMcpConnectionInput', () => {
  const connection = {
    host: 'http://localhost:4000',
    database: 'public',
    username: 'root',
    password: 'system-secret',
    timezone: 'UTC',
  }

  it('keeps system credentials when not in demo mode', () => {
    expect(resolveMcpConnectionInput(connection, { useDemoAccount: false })).toEqual(connection)
  })

  it('replaces auth with demo AI account when Query Guide is on', () => {
    expect(resolveMcpConnectionInput(connection, { useDemoAccount: true })).toEqual({
      ...connection,
      username: MCP_DEMO_USERNAME,
      password: MCP_DEMO_PASSWORD,
    })
  })
})

describe('buildMcpArgs / JSON / CLI', () => {
  it('matches GitHub demo shape for local defaults', () => {
    const params = buildMcpConnectionParams({
      host: 'http://localhost:4000',
      database: 'public',
      username: '',
      password: '',
    })
    expect(buildMcpArgs(params)).toEqual(['--host', 'localhost', '--database', 'public'])
    expect(JSON.parse(buildMcpServersJson(params))).toEqual({
      mcpServers: {
        greptimedb: {
          command: 'greptimedb-mcp-server',
          args: ['--host', 'localhost', '--database', 'public'],
        },
      },
    })
  })

  it('adds auth when set and omits default MySQL port', () => {
    const params = buildMcpConnectionParams({
      host: 'http://db.example.com:5177',
      database: 'public',
      username: 'root',
      password: 'p@ss',
      timezone: '+08:00',
    })
    expect(buildMcpArgs(params)).toEqual([
      '--host',
      'db.example.com',
      '--database',
      'public',
      '--user',
      'root',
      '--password',
      'p@ss',
      '--timezone',
      '+08:00',
      '--http-port',
      '5177',
    ])
    expect(buildMcpCliCommand(params)).toContain('--password "p@ss"')
    expect(buildMcpArgs(params)).not.toContain('--port')
  })

  it('points the HTTP tools at the dashboard origin when served over HTTPS', () => {
    const params = buildMcpConnectionParams({
      host: 'https://live.example.com',
      database: 'public',
      username: 'root',
      password: '',
    })
    expect(buildMcpArgs(params)).toEqual([
      '--host',
      'live.example.com',
      '--database',
      'public',
      '--user',
      'root',
      '--http-port',
      '443',
      '--http-protocol',
      'https',
    ])
    const json = JSON.parse(buildMcpServersJson(params))
    expect(json.mcpServers.greptimedb.args).toContain('--http-protocol')
  })

  it('omits HTTP args for the local plain-HTTP default', () => {
    const params = buildMcpConnectionParams({
      host: 'http://localhost:4000',
      database: 'public',
      username: '',
      password: '',
    })
    expect(buildMcpArgs(params)).not.toContain('--http-port')
    expect(buildMcpArgs(params)).not.toContain('--http-protocol')
  })

  it('buildMcpSetupPrompt embeds config between intro and outro', () => {
    const json = buildMcpServersJson(
      buildMcpConnectionParams({
        host: 'http://localhost:4000',
        database: 'public',
        username: '',
        password: '',
      })
    )
    const prompt = buildMcpSetupPrompt(json, 'Configure MCP:', 'Repo: example')
    expect(prompt).toContain('Configure MCP:')
    expect(prompt).toContain('"mcpServers"')
    expect(prompt).toContain('Repo: example')
    expect(prompt.endsWith('\n')).toBe(true)
  })
})
