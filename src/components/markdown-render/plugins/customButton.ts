import type MarkdownIt from 'markdown-it'
import type { RenderRule } from 'markdown-it/lib/renderer'

export default function customButton(md: MarkdownIt) {
  const codeInline = md.renderer.rules.code_inline as RenderRule
  md.renderer.rules.code_inline = (...args) => {
    const res = codeInline(...args)

    if (/@button:.*=.*/.test(res)) {
      const [tokens, idx] = args
      const token = tokens[idx]

      const [_, action, configStr] = token.content.match(/@button:(.*)=(.*)/) || []
      const config = configStr ? JSON.parse(configStr) : {}

      switch (action) {
        case 'import':
          return `<import-presets from="${config.from}" table="${config.table}">
          ${config.label || 'Import'}
          </import-presets>`

        default:
          break
      }
    }

    return res
  }
}
