import type MarkdownIt from 'markdown-it'
import type { RenderRule } from 'markdown-it/lib/renderer'
import type Token from 'markdown-it/lib/token'
import container from 'markdown-it-container'
import { nanoid } from 'nanoid'

type ContainerArgs = [typeof container, string, { render: RenderRule }]

const extractLang = (info: string) => {
  return info
    .trim()
    .replace(/:(no-)?line-numbers$/, '')
    .replace(/(-vue|{| ).*$/, '')
    .replace(/^vue-html$/, 'template')
}

const extractTitle = (info: string) => {
  return info.match(/\[(.*)\]/)?.[1] || extractLang(info) || 'txt'
}

function createContainer(klass: string, defaultTitle: string, md: MarkdownIt): ContainerArgs {
  return [
    container,
    klass,
    {
      render(tokens, idx) {
        const token = tokens[idx]
        const info = token.info.trim().slice(klass.length).trim()
        if (token.nesting === 1) {
          const title = md.renderInline(info || defaultTitle)
          if (klass === 'details') {
            return `<details class="${klass} custom-block"><summary>${title}</summary>\n`
          }
          return `<div class="${klass} custom-block"><p class="custom-block-title">${title}</p>\n`
        }
        return klass === 'details' ? `</details>\n` : `</div>\n`
      },
    },
  ]
}
function createCodeGroup(): ContainerArgs {
  return [
    container,
    'code-group',
    {
      render(tokens, idx) {
        if (tokens[idx].nesting === 1) {
          const name = nanoid(5)
          let tabs = ''
          let checked = 'checked="checked"'

          for (
            let i = idx + 1;
            !(tokens[i].nesting === -1 && tokens[i].type === 'container_code-group_close');
            i += 1
          ) {
            if (tokens[i].type === 'fence' && tokens[i].tag === 'code') {
              const title = extractTitle(tokens[i].info)
              const id = nanoid(7)
              tabs += `<input type="radio" name="group-${name}" id="tab-${id}" ${checked}><label for="tab-${id}">${title}</label>`

              if (checked) {
                tokens[i].info += ' active'
                checked = ''
              }
            }
          }

          return `<div class="vp-code-group"><div class="tabs">${tabs}</div><div class="blocks">\n`
        }
        return `</div></div>\n`
      },
    },
  ]
}

export function containerPlugin(md: MarkdownIt) {
  md.use(...createContainer('tip', 'TIP', md))
    .use(...createContainer('info', 'INFO', md))
    .use(...createContainer('warning', 'WARNING', md))
    .use(...createContainer('danger', 'DANGER', md))
    .use(...createContainer('details', 'Details', md))
    // explicitly escape Vue syntax
    .use(container, 'v-pre', {
      render: (tokens: Token[], idx: number) => (tokens[idx].nesting === 1 ? `<div v-pre>\n` : `</div>\n`),
    })
    .use(container, 'raw', {
      render: (tokens: Token[], idx: number) => (tokens[idx].nesting === 1 ? `<div class="vp-raw">\n` : `</div>\n`),
    })
    .use(...createCodeGroup())
}

export function customCode(md: MarkdownIt) {
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

export function customImage(md: MarkdownIt) {
  const defaultRender = md.renderer.rules.image
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

    return `<div class="${klass}" title="${alt}">
    <img src="${src}" alt="${alt}" style="width:${width};height:${height}"/>
    </div>`
  }
}

export function customComment(md: MarkdownIt) {
  const defaultRender = md.renderer.rules.text!
  md.renderer.rules.text = (tokens, idx, options, env, self) => {
    if (tokens[idx].content.startsWith('<!--') && tokens[idx].content.endsWith('-->')) {
      return ''
    }
    return defaultRender(tokens, idx, options, env, self)
  }
}
