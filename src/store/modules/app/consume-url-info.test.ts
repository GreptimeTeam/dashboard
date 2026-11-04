import { describe, expect, it } from 'vitest'
import { applyUrlInfoToConfig, consumeUrlInfo } from './consume-url-info'

describe('consumeUrlInfo', () => {
  it('reads info from pre-hash search and strips it while keeping hash', () => {
    const info = btoa(JSON.stringify({ username: 'greptime' }))
    const result = consumeUrlInfo('/', `?info=${info}`, '#/dashboard/query')
    expect(result.info).toBe(info)
    expect(result.nextUrl).toBe('/#/dashboard/query')
  })

  it('reads info from hash query and preserves other hash params', () => {
    const info = btoa(JSON.stringify({ username: 'greptime', password: 'demosession' }))
    const result = consumeUrlInfo('/', '', `#/dashboard/query?info=${info}&sql=SELECT%201`)
    expect(result.info).toBe(info)
    expect(result.nextUrl).toBe('/#/dashboard/query?sql=SELECT%201')
  })

  it('prefers search info over hash info and strips both', () => {
    const searchInfo = btoa(JSON.stringify({ username: 'from-search' }))
    const hashInfo = btoa(JSON.stringify({ username: 'from-hash' }))
    const result = consumeUrlInfo('/', `?info=${searchInfo}`, `#/dashboard/query?info=${hashInfo}&sql=x`)
    expect(result.info).toBe(searchInfo)
    expect(result.nextUrl).toBe('/#/dashboard/query?sql=x')
  })

  it('returns null info when absent', () => {
    const result = consumeUrlInfo('/', '', '#/dashboard/query?sql=1')
    expect(result.info).toBeNull()
    expect(result.nextUrl).toBe('/#/dashboard/query?sql=1')
  })
})

describe('applyUrlInfoToConfig', () => {
  it('merges decoded config', () => {
    const info = btoa(JSON.stringify({ username: 'greptime', password: 'demosession' }))
    expect(applyUrlInfoToConfig({ host: 'http://localhost' }, info)).toEqual({
      host: 'http://localhost',
      username: 'greptime',
      password: 'demosession',
    })
  })

  it('ignores malformed info', () => {
    expect(applyUrlInfoToConfig({ username: 'a' }, 'not-base64')).toEqual({ username: 'a' })
  })
})
