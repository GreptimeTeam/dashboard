<script>
  import MarkdownIt from 'markdown-it'
  import { containerPlugin, customCode, customImage, customComment } from '@/utils/mdPlugins'
  import meta from 'markdown-it-meta'
  import { compile, h } from 'vue'
  import CodeEditor from './code-editor.vue'

  const md = new MarkdownIt()
  md.use(customComment).use(containerPlugin).use(customCode).use(customImage).use(meta)

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
