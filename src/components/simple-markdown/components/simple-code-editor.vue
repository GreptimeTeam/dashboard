<template lang="pug">
.code-editor.editor-card(:bordered="false")
  .code
    CodeMirror(v-model="code" :disabled="true" :extensions="[oneDark, mapLanguages(lang)()]")
    a-button.copy(type="text" title="Copy Code" @click="copy")
      svg
        use(href="#copy-new")
</template>

<script lang="ts" setup name="SimpleCodeEditor">
  import i18n from '@/locale'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { Message } from '@arco-design/web-vue'
  import { oneDark } from '@codemirror/theme-one-dark'
  import mapLanguages from '@/components/markdown-render/components/utils'

  // data
  const props = defineProps({
    disabled: {
      type: Boolean,
      default: false,
    },
    lang: {
      type: String,
      default: 'sql',
    },
  })

  const slots = useSlots()

  function codeFormat(code: any) {
    if (!code) return ''
    code = code?.[0]?.children[0]?.children
    return code
  }

  const code = ref(codeFormat(slots?.default?.()))

  const copy = () => {
    navigator.clipboard.writeText(code.value)
    Message.success({
      content: i18n.global.t('copied'),
      duration: 2 * 1000,
    })
  }
</script>

<style lang="less" scoped>
  .code-editor {
    margin-bottom: 20px;

    .operations {
      display: flex;
      margin-bottom: 10px;
    }
    .code {
      position: relative;
      display: flex;
      width: 100%;

      :deep(.cm-editor) {
        width: 100%;
      }
    }

    .arco-code {
      margin-top: 20px;
    }

    .logs {
      margin-top: 20px;
    }

    :deep(.arco-btn) {
      min-width: 80px;
    }

    &:hover .copy {
      opacity: 1;
    }

    .copy {
      opacity: 0;
      position: absolute;
      width: 20px;
      height: 20px;
      min-width: 10px;
      padding: 0;
      right: 10px;
      top: 10px;
      z-index: 1;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.3s;
      background-color: var(--vp-c-black-mute);

      &:hover {
        background-color: var(--vp-c-black-mute);
      }

      svg {
        color: var(--vp-c-gray-light-2);
        width: 20px;
        height: 20px;

        &:hover {
          color: var(--vp-c-white-soft);
        }
      }
    }
  }

  :deep(.arco-list-content) {
    background: var(--main-bg-color);
  }

  :deep(.arco-list-item-action) {
    width: 32px;
    margin: 0;
    padding-left: 0;
  }

  :deep(.arco-list-item-main) {
    width: 100%;
  }

  :deep(.arco-list-small .arco-list-content-wrapper .arco-list-content > .arco-list-item) {
    padding: 10px 20px;
  }

  .arco-list-hover .arco-list-item:hover {
    background-color: inherit;
  }
</style>
