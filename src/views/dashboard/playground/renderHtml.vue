<script>
  import MarkdownIt from 'markdown-it'
  import { containerPlugin, customCode, customImage, customComment, customToc } from '@/utils/mdPlugins'
  import metaPlugin from 'markdown-it-meta'
  import anchor from 'markdown-it-anchor'
  import string from 'string'
  import uslug from 'uslug'
  import { tocPlugin } from '@mdit-vue/plugin-toc'
  import { compile, h } from 'vue'
  import CodeEditor from './code-editor.vue'

  const md = new MarkdownIt()
  const legacySlugify = (s) => string(s).slugify().toString()
  const uslugify = (s) => uslug(s)

  md.use(customComment)
    .use(customCode)
    .use(customImage)
    .use(customToc)
    .use(containerPlugin)
    .use(anchor, {
      level: 1,
      slugify: uslugify,
    })
    .use(tocPlugin, {
      linkTag: 'router-link',
    })
    .use(metaPlugin)

  export default {
    components: {
      CodeEditor,
    },
    props: {
      file: {
        type: Object,
        default: () => ({}),
      },
    },
    data() {
      return {
        renderedDocument: '',
      }
    },
    watch: {
      file: {
        handler({ content, metadata } = {}) {
          if (metadata?.toc) {
            content = `[[toc]]\n${content}`
          }
          this.renderedDocument = md.render(content || '')
        },
        immediate: true,
      },
    },
    updated() {
      const hash = this.$router.currentRoute.value?.hash

      if (hash) {
        const el = document.getElementById(hash.slice(1))
        setTimeout(() => {
          if (el) {
            el.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' })
          }
        }, 0)
      }
    },
    render() {
      return h(
        'div',
        {
          class: this?.file?.metadata?.toc ? 'with-toc' : '',
        },
        compile(this.renderedDocument)(this)
      )
    },
  }
</script>
