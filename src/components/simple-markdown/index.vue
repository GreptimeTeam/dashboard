<script>
  import { compile, h } from 'vue'
  import meta from 'markdown-it-meta'
  import MarkdownIt from 'markdown-it'
  import CodeEditor from './components/code-editor.vue'
  import plugins from './plugins'

  const md = new MarkdownIt()
  md.use(meta)

  Object.values(plugins).forEach((plugin) => {
    md.use(plugin)
  })

  export default {
    components: {
      CodeEditor,
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
      return h(compile(this.renderedDocument, { delimiters: ['${{', '}}'] })(this))
    },
  }
</script>
