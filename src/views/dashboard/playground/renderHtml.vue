<script>
  import MarkdownIt from 'markdown-it'
  import plugins from '@/utils/mdPlugins'
  import meta from 'markdown-it-meta'
  import { compile, h } from 'vue'
  import CodeEditor from './code-editor.vue'

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
      }
    },
    watch: {
      md: {
        handler(val) {
          this.renderedDocument = md.render(val || '')
        },
        immediate: true,
      },
    },
    render() {
      return h(compile(this.renderedDocument)(this))
    },
  }
</script>
