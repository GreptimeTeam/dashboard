<script>
  // Cool way to render Vue components from HTML Strings
  // https://medium.com/haiiro-io/compile-markdown-as-vue-template-on-nuxt-js-1c606c15731c
  import VueWithCompiler from 'vue/dist/vue.esm'

  export default {
    props: {
      html: {
        type: String,
        default: '',
      },
    },
    data() {
      return { templateRender: undefined }
    },
    watch: {
      html(to) {
        this.updateRender()
      },
    },
    created() {
      this.updateRender()
    },
    methods: {
      updateRender() {
        /* eslint-disable no-restricted-syntax */
        const compiled = VueWithCompiler.compile(this.html)
        this.templateRender = compiled.render
        this.$options.staticRenderFns = []
        for (const staticRenderFunction of compiled.staticRenderFns) {
          this.$options.staticRenderFns.push(staticRenderFunction)
        }
      },
    },
    render() {
      return this.templateRender()
    },
  }
</script>
