<!-- eslint-disable vue/one-component-per-file -->
<script>
  import { h, defineComponent } from 'vue'
  import meta from 'markdown-it-meta'
  import MarkdownIt from 'markdown-it'
  import plugins from './plugins'
  import CodeEditor from './components/code-editor.vue'
  import ImportPresets from './components/importPresets.vue'
  import codeGroups from './composables/codeGroups'

  const md = new MarkdownIt()
  md.use(meta)
  Object.values(plugins).forEach((plugin) => {
    md.use(plugin)
  })

  export default {
    components: {
      CodeEditor,
      ImportPresets,
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
          state.authorization = `${btoa(`${state.username}:${state.password}`)}`

          const content = val?.replace(/<([^>]+)>/g, (match, key) => {
            return state[key] || match
          })

          this.renderedDocument = md.render(content || '')
        },
        immediate: true,
      },
    },
    mounted() {
      codeGroups()
    },
    render() {
      if (!this.renderedDocument) {
        return h('div')
      }

      try {
        // Create a wrapper component with the rendered markdown
        const template = `<div class="markdown-content">${this.renderedDocument}</div>`
        const component = defineComponent({
          template,
          components: this.$options.components,
        })
        return h(component)
      } catch (error) {
        console.error('Markdown render error:', error)
        return h('div', {
          class: 'markdown-error',
          innerHTML: this.renderedDocument,
        })
      }
    },
  }
</script>
