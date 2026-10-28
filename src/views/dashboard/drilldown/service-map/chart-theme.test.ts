import { describe, expect, it } from 'vitest'
import { resolveServiceMapTheme, withAlpha } from './chart-theme'

describe('withAlpha', () => {
  it('converts short and long hex colors and leaves other colors untouched', () => {
    expect(withAlpha('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
    expect(withAlpha(' #702fed ', 0.1)).toBe('rgba(112, 47, 237, 0.1)')
    expect(withAlpha('rgba(1,2,3,1)', 0.5)).toBe('rgba(1,2,3,1)')
  })
})

describe('resolveServiceMapTheme', () => {
  it('uses fallbacks when tokens are unset and fixed text colors in dark mode', () => {
    const fallback = (_name: string, value: string) => value
    const light = resolveServiceMapTheme(fallback, false)
    const dark = resolveServiceMapTheme(fallback, true)
    expect(light.text).toBe('#473460')
    expect(dark.text).toBe('#f4f0fa')
    expect(light.instance).toBe('#5a4a70')
    expect(light.container).toBe('#00bbb2')
    expect(light.instance).not.toBe(light.container)
    expect(light.palette[0]).toEqual({ fill: 'rgba(112, 47, 237, 0.1)', stroke: '#702fed' })
    expect(dark.palette[0].fill).toBe('rgba(112, 47, 237, 0.18)')
  })

  it('reads CSS tokens through the injected reader', () => {
    const theme = resolveServiceMapTheme((name, value) => (name === '--gpt-danger' ? '#ff0000' : value), false)
    expect(theme.danger).toBe('#ff0000')
  })
})
