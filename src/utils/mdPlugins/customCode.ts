import type MarkdownIt from 'markdown-it'
import type { RenderRule } from 'markdown-it/lib/renderer'

export default function customCode(md: MarkdownIt) {
  const fence = md.renderer.rules.fence as RenderRule
  md.renderer.rules.fence = (...args) => {
    const rawCode = fence(...args)

    const [tokens, idx] = args
    const token = tokens[idx]

    const [[chartType] = [''], selectedYTypes = [], groupBySelectedTypes = []] =
      token.info
        .match(/\((.*)\)/)?.[1]
        .split('|')
        .map((item) => item.split(',')) || []
    const defaultChartForm = {
      chartType: chartType || 'line',
      selectedYTypes,
      groupBySelectedTypes,
    }

    const res = rawCode?.replace(
      /<pre><code class="language-(\w*?)">([\s\S]*)<\/code><\/pre>/,
      ($1: string, $2: string) => {
        if ($2.toLowerCase() === 'sql') {
          return `<code-editor lang="${$2}" defaultChartForm='${JSON.stringify(defaultChartForm)}'>${$1}</code-editor>`
        }
        return `<code-editor lang="${$2}" disabled>${$1}</code-editor>`
      }
    )
    return `${res}`
  }
}
