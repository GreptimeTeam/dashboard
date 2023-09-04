<script>
  import { compile, h } from 'vue'
  import meta from 'markdown-it-meta'
  import MarkdownIt from 'markdown-it'
  import plugins from './plugins'
  import CodeEditor from './components/code-editor.vue'
  import codeGroups from './composables/codeGroups'

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
          const state = useAppStore()

          const content = val?.replace(/<([^>]+)>/g, (match, key) => {
            return state[key] || match
          })

          const mdContent = md.render(content || '')

          this.renderedDocument = mdContent
          this.renderedDocument = md.render(val || '')
        },
        immediate: true,
      },
    },
    mounted: () => {
      codeGroups()
    },
    render() {
      return h(compile(this.renderedDocument)(this))
    },
  }
</script>
@/components/markdown-render/mdPlugins
