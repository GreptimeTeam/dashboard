import type MarkdownIt from 'markdown-it'

export default function customCode(md: MarkdownIt) {
  const fence = md.renderer.rules.fence!
  md.renderer.rules.fence = (...args) => {
    const rawCode = fence(...args)

    const res = rawCode.replace(
      /<pre><code class="language-(\w*?)">([\s\S]*)<\/code><\/pre>/,
      function ($1: string, $2: string) {
        if ($2.toLowerCase() === 'sql') {
          return `<code-editor lang="${$2}">${$1}</code-editor>`
        }
        return `<code-editor lang="${$2}" disabled>${$1}</code-editor>`
      }
    )
    return `${res}`
  }
}
