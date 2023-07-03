import type MarkdownIt from 'markdown-it'
import type { RenderRule } from 'markdown-it/lib/renderer'

export default function customComment(md: MarkdownIt) {
  const defaultRender = md.renderer.rules.text as RenderRule
  md.renderer.rules.text = (tokens, idx, options, env, self) => {
    if (tokens[idx].content.startsWith('<!--') && tokens[idx].content.endsWith('-->')) {
      return ''
    }
    return defaultRender(tokens, idx, options, env, self)
  }
}
