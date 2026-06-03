<template lang="pug">
.promql-editor-container
  CodeMirror(
    style="height: 100%"
    :placeholder="placeholder"
    :modelValue="props.modelValue"
    :extensions="extensions"
    :spellcheck="false"
    :autofocus="false"
    :indent-with-tab="false"
    :tabSize="2"
    :disabled="disabled"
    @change="codeUpdate"
    @ready="onEditorReady"
  )
  .query-button-container
    a-tooltip(content="Ctrl + Enter" position="right")
      a-button(
        type="primary"
        size="large"
        style="height: var(--gpt-control-height-md); border-radius: 0 var(--gpt-radius-sm) var(--gpt-radius-sm) 0"
        :loading="queryLoading"
        @click="handleQuery"
      )
        template(#icon)
          icon-loading(v-if="queryLoading" spin)
          icon-play-arrow(v-else)
        | {{ $t('dashboard.runQuery') }}
</template>

<script setup lang="ts">
  import { ref, computed, watch, onMounted } from 'vue'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'
  import { PromQLExtension } from '@prometheus-io/codemirror-promql'
  import { useAppStore } from '@/store'
  import axios from 'axios'
  import { keymap, EditorView } from '@codemirror/view'
  import { Prec } from '@codemirror/state'
  import { IconLoading, IconPlayArrow } from '@arco-design/web-vue/es/icon'

  const props = defineProps<{
    modelValue: string
    disabled?: boolean
    placeholder?: string
    queryLoading?: boolean
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void
    (e: 'query'): void
  }>()

  const appStore = useAppStore()
  let editorView: any = null

  const prometheusBaseURL = '/v1/prometheus/api/v1'
  const createResponse = (data: any, status = 200, statusText = 'OK'): Response => {
    const responseBody = JSON.stringify(data)
    const bodyStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(responseBody))
        controller.close()
      },
    })

    return {
      ok: true,
      status,
      statusText,
      headers: new Headers(),
      redirected: false,
      type: 'cors' as const,
      url: '',
      body: bodyStream,
      bodyUsed: false,
      clone: () => ({ ...data, body: bodyStream }),
      json: async () => data,
      text: async () => responseBody,
      blob: async () => new Blob([responseBody]),
      arrayBuffer: async () => new TextEncoder().encode(responseBody).buffer,
      formData: async () => new FormData(),
      bytes: async () => new TextEncoder().encode(responseBody),
    } as unknown as Response
  }

  const handleQuery = () => {
    emit('query')
  }
  const normalizeUrl = (resource: any): string => {
    const requestUrl = typeof resource === 'object' && resource.url ? resource.url : resource

    if (typeof requestUrl === 'string') {
      if (requestUrl.startsWith('http')) {
        return requestUrl
      }
      if (requestUrl.startsWith('/v1/prometheus/api/v1/')) {
        return requestUrl
      }
      if (requestUrl.startsWith('/api/v1/')) {
        return `/v1/prometheus${requestUrl}`
      }
      if (requestUrl.startsWith('/')) {
        return `${prometheusBaseURL}${requestUrl}`
      }
      return `${prometheusBaseURL}/${requestUrl}`
    }
    return requestUrl
  }

  const myHTTPClient = async (resource: any, options: any = {}): Promise<Response> => {
    const requestUrl = normalizeUrl(resource)

    if (requestUrl.includes('/metadata')) {
      return createResponse({ status: 'success', data: {} })
    }

    try {
      const { method = 'GET', headers = {}, params, body } = options
      const config: any = {
        method,
        headers,
        params: {
          db: appStore.database,
        },
      }

      if (params) {
        config.params = { ...config.params, ...params }
      }

      if (body) {
        config.data = body
      }

      const response = await axios({
        url: requestUrl,
        ...config,
      })

      let responseData = { status: 'success', data: response.data }

      if (
        requestUrl.includes('/label/__name__/values') ||
        requestUrl.includes('/labels') ||
        (requestUrl.includes('/label/') && requestUrl.includes('/values'))
      ) {
        responseData = { status: 'success', data: response.data }

        if (!Array.isArray(response.data)) {
          responseData.data = []
        }
      } else if (requestUrl.includes('/series')) {
        responseData = { status: 'success', data: response.data }

        if (!Array.isArray(response.data)) {
          responseData.data = []
        }
      } else {
        responseData = { status: 'success', data: response.data }

        if (!Array.isArray(response.data)) {
          responseData.data = []
        }
      }

      return createResponse(responseData, response.status, response.statusText)
    } catch (error: any) {
      console.error('PromQL fetch error:', error)
      return createResponse(
        { status: 'error', error: error.message },
        error.response?.status || 500,
        error.message || 'Network Error'
      )
    }
  }

  // Create PromQL extension
  const promqlExtension = ref<any>(null)

  const initializePromQLExtension = () => {
    promqlExtension.value = new PromQLExtension()
      .activateCompletion(true)
      .activateLinter(true)
      .setComplete({
        remote: {
          url: '',
          fetchFn: myHTTPClient,
          lookbackInterval: 60 * 60 * 1000,
        },
      })
      .asExtension()
  }

  const singleLineKeymap = Prec.highest(
    keymap.of([
      {
        key: 'Enter',
        run: () => true,
      },
      {
        key: 'Shift-Enter',
        run: () => true,
      },
      {
        key: 'Ctrl-Enter',
        run: () => {
          handleQuery()
          return true
        },
      },
      {
        key: 'Cmd-Enter',
        run: () => {
          return true
        },
      },
    ])
  )

  const extensions = computed(() => {
    const exts = [basicSetup, singleLineKeymap]

    if (promqlExtension.value) {
      exts.push(promqlExtension.value)
    }

    return exts
  })

  const codeUpdate = (content: string) => {
    const singleLineContent = content.replace(/[\r\n]+/g, ' ').trim()
    emit('update:modelValue', singleLineContent)
  }

  const onEditorReady = (payload: any) => {
    editorView = payload.view
  }
  const insertTextAtCursor = (text: string) => {
    if (!editorView) return

    const transaction = editorView.state.update({
      changes: {
        from: editorView.state.selection.main.head,
        insert: text,
      },
      selection: {
        anchor: editorView.state.selection.main.head + text.length,
      },
    })

    editorView.dispatch(transaction)
    editorView.focus()
  }

  const replaceEditorContent = (text: string) => {
    const singleLineContent = text.replace(/[\r\n]+/g, ' ').trim()
    if (!editorView) {
      emit('update:modelValue', singleLineContent)
      return
    }

    const docLength = editorView.state.doc.length
    editorView.dispatch({
      changes: { from: 0, to: docLength, insert: singleLineContent },
      selection: { anchor: singleLineContent.length },
    })
    editorView.focus()
    codeUpdate(singleLineContent)
  }

  const focus = () => {
    if (editorView) {
      editorView.focus()
    }
  }

  const getCursorPosition = () => {
    if (!editorView) return 0
    return editorView.state.selection.main.head
  }

  const getText = () => {
    if (!editorView) return ''
    return editorView.state.doc.toString()
  }

  watch(
    () => appStore.database,
    () => {
      initializePromQLExtension()
    }
  )

  onMounted(() => {
    initializePromQLExtension()
  })
  defineExpose({
    insertTextAtCursor,
    replaceEditorContent,
    focus,
    getCursorPosition,
    getText,
  })
</script>

<style lang="less" scoped>
  .promql-editor-container {
    display: flex;
    align-items: stretch;
    gap: 0;
    min-height: var(--gpt-control-height-md);
  }

  .query-button-container {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  :deep(.arco-card.light-editor-card) {
    padding-right: 0;
  }
  :deep(.arco-card-body) {
    height: 100%;
  }
  :deep(.cm-focused) {
    outline: none;
  }

  :deep(.cm-editor) {
    height: var(--gpt-control-height-md);
    overflow: visible;
    width: 100%;
    background: var(--gpt-bg-panel);
    color: var(--gpt-text-primary);
    border: 1px solid var(--gpt-editor-border);
    border-radius: var(--gpt-radius-sm) 0 0 var(--gpt-radius-sm);
    transition: all 0.2s ease-in-out;
  }

  :deep(.cm-editor .cm-content),
  :deep(.cm-editor .cm-line),
  :deep(.ͼ1.cm-editor .cm-content),
  :deep(.ͼ1.cm-editor .cm-line) {
    line-height: var(--gpt-control-height-md);
  }

  :deep(.cm-scroller) {
    overflow: visible;
    font-family: var(--vp-font-family-base);
    font-size: var(--gpt-font-lg);
    font-weight: 400;
    line-height: 1.5;
  }

  :deep(.cm-content) {
    padding: 0 var(--gpt-gap-md);
    min-height: 32px;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
  }

  :deep(.cm-line) {
    padding: 0;
  }

  :deep(.cm-activeLine),
  :deep(.ͼ1 .cm-activeLine) {
    background-color: transparent !important;
  }

  :deep(.cm-gutters) {
    display: none !important;
  }

  :deep(.cm-lineNumbers) {
    display: none !important;
  }

  :deep(.cm-tooltip) {
    z-index: 1000;
  }

  :deep(.cm-tooltip.cm-completionInfo) {
    z-index: 1001;
  }
  :deep(.cm-tooltip.cm-tooltip-autocomplete) {
    background-color: var(--gpt-bg-surface);
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-sm);
    box-shadow: 0 2px 8px var(--box-shadow-color);

    & > ul {
      max-height: 350px;
      font-family: 'DejaVu Sans Mono', monospace;
      max-width: unset;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    & > ul > li {
      padding: var(--gpt-gap-md) var(--gpt-gap-lg);
      cursor: pointer;
      border-bottom: 1px solid var(--gpt-border-subtle);

      &:hover {
        background-color: var(--gpt-bg-header);
      }

      &[aria-selected] {
        background-color: var(--gpt-nav-active-bg);
        color: unset;
      }

      &:last-child {
        border-bottom: none;
      }
    }

    min-width: 30%;
  }

  :deep(.cm-tooltip.cm-completionInfo) {
    background-color: var(--gpt-nav-active-bg);
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-sm);
    box-shadow: 0 2px 8px var(--box-shadow-color);
    margin-top: -11px;
    padding: var(--gpt-gap-lg);
    font-family: var(--font-family-base);
    min-width: 250px;
    max-width: min-content;
    z-index: 1001;
  }

  :deep(.cm-completionIcon) {
    box-sizing: content-box;
    font-size: var(--gpt-font-xl);
    line-height: 1;
    margin-right: 10px;
    vertical-align: top;
    color: var(--gpt-main-purple);
    opacity: 1;
  }

  :deep(.cm-completionMatchedText) {
    color: var(--gpt-brand-700);
    text-decoration: none;
    font-weight: bold;
  }
  :deep(.cm-completionDetail) {
    float: right;
    color: var(--gpt-text-muted);
    font-size: var(--gpt-font-base);
  }
</style>
