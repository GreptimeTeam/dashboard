import { ChartFormType, PromForm, SchemaType } from '@/store/modules/code-run/types'
import type MarkdownIt from 'markdown-it'
import type { RenderRule } from 'markdown-it/lib/renderer'

export default function customCode(md: MarkdownIt) {
  const fence = md.renderer.rules.fence as RenderRule
  md.renderer.rules.fence = (...args) => {
    const rawCode = fence(...args)

    const [tokens, idx] = args
    const token = tokens[idx]

    const params =
      token.info
        .match(/\((.*)\)/)?.[1]
        .split('|')
        .map((item) => item.split(',')) || []
    const defaultChartForm: { [key: string]: ChartFormType | PromForm } = {
      sql: {
        chartType: params[0]?.[0] || 'line',
        selectedYTypes: params[1] || [],
        xAxisType: { name: params[2]?.[0] || 'ts' } as SchemaType,
        groupBySelectedTypes: params[3] || [],
      },
      promql: {
        time: params[0]?.length === 1 ? +params[0][0] : 0,
        range: params[0]?.length === 2 ? params[0] : [],
        step: params[1]?.[0] || '15s',
      },
    }

    const res = rawCode?.replace(
      /<pre><code class="language-(\w*?)">([\s\S]*)<\/code><\/pre>/,
      ($1: string, $2: string) => {
        const disabled = /sql|promql/.test($2.toLowerCase()) ? '' : 'disabled'
        return `<code-editor lang="${$2}" defaultChartForm='${JSON.stringify(
          defaultChartForm[$2] || {}
        )}' ${disabled}>${$1}</code-editor>`
      }
    )
    return `${res}`
  }
}
