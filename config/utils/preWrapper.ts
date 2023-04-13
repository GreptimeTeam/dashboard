import type MarkdownIt from 'markdown-it'

const extractLang = (info: string) => {
  return info
    .trim()
    .replace(/:(no-)?line-numbers$/, '')
    .replace(/(-vue|{| ).*$/, '')
    .replace(/^vue-html$/, 'template')
}

export function preWrapperPlugin(md: MarkdownIt) {
  const fence = md.renderer.rules.fence!
  md.renderer.rules.fence = (...args) => {
    const { info } = args[0][args[1]]
    const lang = extractLang(info)
    const rawCode = fence(...args)
    return `<div class="language-${lang}${
      / active( |$)/.test(info) ? ' active' : ''
    }"><button title="Copy Code" class="copy"></button><span class="lang">${lang}</span>${rawCode}</div>`
  }
}

export function extractTitle(info: string) {
  return info.match(/\[(.*)\]/)?.[1] || extractLang(info) || 'txt'
}
