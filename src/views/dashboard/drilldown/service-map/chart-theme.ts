export interface ServiceMapTheme {
  text: string
  surface: string
  border: string
  edge: string
  /** Structural part_of / runs_on edge stroke. */
  structural: string
  /** service.instance / k8s.pod satellite glyph. */
  instance: string
  /** container / host / process satellite glyph. */
  container: string
  danger: string
  warn: string
  ok: string
  external: string
  database: string
  palette: Array<{ fill: string; stroke: string }>
}

/** `#rgb` / `#rrggbb` → `rgba(...)`; any other color string is returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1]
  if (!hex) return color
  const fullHex = hex.length === 3 ? [...hex].map((part) => part + part).join('') : hex
  const [red, green, blue] = [0, 2, 4].map((index) => Number.parseInt(fullHex.slice(index, index + 2), 16))
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

/** `readToken(name, fallback)` resolves a CSS custom property, falling back when it is unset. */
export function resolveServiceMapTheme(
  readToken: (name: string, fallback: string) => string,
  dark: boolean
): ServiceMapTheme {
  const primary = readToken('--gpt-main-purple', '#702fed')
  const paletteStrokes = [
    readToken('--gpt-brand-600', primary),
    readToken('--gpt-semantic-field', '#3fa4ff'),
    readToken('--gpt-accent-ts', '#00bbb2'),
    readToken('--gpt-semantic-tag', '#c478ff'),
    readToken('--gpt-brand-700', '#5a4a70'),
    readToken('--gpt-brand-300', '#c4a8f0'),
  ]
  return {
    text: dark ? '#f4f0fa' : readToken('--gpt-text-primary', '#473460'),
    surface: dark ? '#25212b' : readToken('--gpt-bg-panel', '#ffffff'),
    border: dark ? 'rgba(255,255,255,.24)' : readToken('--gpt-border-strong', 'rgba(71,52,96,.15)'),
    // Strong enough to read call direction on a light panel without competing with node titles.
    edge: dark ? 'rgba(205, 196, 218, 0.72)' : 'rgba(71, 52, 96, 0.55)',
    structural: dark ? 'rgba(180, 170, 196, 0.78)' : 'rgba(90, 74, 112, 0.55)',
    instance: readToken('--gpt-brand-700', dark ? '#b8a8c8' : '#5a4a70'),
    container: readToken('--gpt-accent-ts', dark ? '#5ecfc8' : '#00bbb2'),
    danger: readToken('--gpt-danger', '#ef4444'),
    warn: readToken('--gpt-warning', '#f59e0b'),
    ok: readToken('--gpt-success', '#22c55e'),
    external: readToken('--gpt-semantic-tag', '#c478ff'),
    database: readToken('--gpt-semantic-field', '#3fa4ff'),
    palette: paletteStrokes.map((stroke) => ({
      // Stronger fill so the disk does not read as a white hole inside the arc.
      fill: withAlpha(stroke, dark ? 0.18 : 0.1),
      stroke,
    })),
  }
}
