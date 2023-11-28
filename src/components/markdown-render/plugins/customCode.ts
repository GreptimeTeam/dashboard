import dayjs from 'dayjs'
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

    const chartParams: ChartFormType = {
      chartType: params[0]?.[0] || 'line',
      selectedYTypes: params[1] || [],
      xAxisType: { name: params[2]?.[0] || 'ts' } as SchemaType,
      groupBySelectedTypes: params[3] || [],
    }

    const promParams: PromForm = {
      // eslint-disable-next-line no-nested-ternary
      time: params.length === 0 ? 5 : params[0]?.length === 1 ? +params[0][0] : 0,
      range:
        params[0]?.length === 2
          ? params[0]
          : [dayjs().subtract(5, 'minute').unix().toString(), dayjs().unix().toString()],
      step: params[1]?.[0] || '30s',
    }

    const res = rawCode?.replace(
      /<pre><code class="language-(\w*?)">([\s\S]*)<\/code><\/pre>/,
      ($1: string, $2: string) => {
        const disabled = /sql|promql/.test($2.toLowerCase()) ? '' : 'disabled'
        return `<code-editor lang="${$2}" chartParams='${JSON.stringify(
          chartParams || {}
        )}' promParams='${JSON.stringify(promParams || {})}' ${disabled}>${$1}</code-editor>`
      }
    )
    return `${res}`
  }
}
