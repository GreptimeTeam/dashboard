import type MarkdownIt from 'markdown-it'

export default function archorWithTargetBlank(md: MarkdownIt) {
  const defaultRender =
    md.renderer.rules.link_open ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options)
    }

  // If you are sure other plugins can't add `target` - drop check below
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const aIndex = tokens[idx].attrIndex('target')

    if (aIndex < 0) {
      tokens[idx].attrPush(['target', '_blank']) // add new attribute
    } else {
      tokens[idx].attrs[aIndex][1] = '_blank' // replace value of existing attr
    }

    // pass token to default renderer.
    return defaultRender(tokens, idx, options, env, self)
  }
}
