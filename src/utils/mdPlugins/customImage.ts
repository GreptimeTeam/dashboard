import type MarkdownIt from 'markdown-it'
import type { RenderRule } from 'markdown-it/lib/renderer'

export default function customImage(md: MarkdownIt) {
  const defaultRender = md.renderer.rules.image as RenderRule
  const isDigital = (str: string) => /^\d+$/.test(str)
  const hasDigital = (str: string) => /\d+/.test(str)

  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const altInfo = token.content || ''
    const src = token.attrGet('src') || ''

    const [alt, size, klass] = altInfo.split('|').map((item) => item.trim())
    let [width, height] = size?.split(/[xX*]/) || []

    if (isDigital(width)) width += 'px'
    if (isDigital(height)) height += 'px'
    if (!height) height = width

    return `<div class="md-image ${klass || ''}" title="${alt}" style="width:${width}">
    <img src="${src}" alt="${alt}" style="width:${width};height:${height}"/>
    </div>`
  }
}
