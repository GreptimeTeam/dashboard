import type MarkdownIt from 'markdown-it'
import type { RenderRule } from 'markdown-it/lib/renderer'

export default function customCode(md: MarkdownIt) {
  const fence = md.renderer.rules.fence as RenderRule
  md.renderer.rules.fence = (...args) => {
    const rawCode = fence(...args)

    const res = rawCode
      ?.replace(/<code/g, '<code')
      ?.replace(/<pre><code class="language-(\w*?)">([\s\S]*)<\/code><\/pre>/, ($1: string, $2: string) => {
        const disabled = /sql|promql/.test($2.toLowerCase()) ? '' : 'disabled'
        return `<code-editor lang="${$2}" ${disabled}>${$1}</code-editor>`
      })
    return `${res}`
  }
}
