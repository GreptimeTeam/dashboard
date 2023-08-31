import type MarkdownIt from 'markdown-it'

export default function customCode(md: MarkdownIt) {
  const fence = md.renderer.rules.fence!
  md.renderer.rules.fence = (...args) => {
    const rawCode = fence(...args)

    const res = rawCode.replace(
      /<pre><code class="language-(\w*?)">([\s\S]*)<\/code><\/pre>/,
      function ($1: string, $2: string) {
        const disabled = /sql|promql/.test($2.toLowerCase())
        return `<code-editor lang="${$2}" ${disabled}>${$1}</code-editor>`
      }
    )
    return `${res}`
  }
}
