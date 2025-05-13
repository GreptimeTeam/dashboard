<script>
  import { compile, h } from 'vue'
  import meta from 'markdown-it-meta'
  import MarkdownIt from 'markdown-it'
  import SimpleCodeEditor from './components/simple-code-editor.vue'
  import plugins from './plugins'

  const md = new MarkdownIt()
  md.use(meta)

  Object.values(plugins).forEach((plugin) => {
    md.use(plugin)
  })

  export default {
    components: {
      SimpleCodeEditor,
    },
    props: {
      md: String,
    },
    data() {
      return {
        renderedDocument: '',
        meta: {},
      }
    },
    watch: {
      md: {
        handler(val) {
          const content = val
          this.renderedDocument = md.render(content || '')
          this.meta = md.meta
        },
        immediate: true,
      },
    },

    render() {
      if (!this.renderedDocument) {
        return h('div')
      }

      try {
        return h('div', {
          class: 'markdown-render',
          innerHTML: this.renderedDocument,
        })
      } catch (error) {
        console.error('Markdown render error:', error)
        return h('div', { class: 'markdown-error' }, 'Error rendering content')
      }
    },
  }
</script>
