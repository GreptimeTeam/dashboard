<template lang="pug">
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
</template>

<script setup lang="ts">
  import { ref, computed, watch, onMounted } from 'vue'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'
  import { PromQLExtension } from '@prometheus-io/codemirror-promql'
  import { useAppStore } from '@/store'
  import axios from 'axios'
  import { keymap } from '@codemirror/view'
  import { Prec } from '@codemirror/state'

  const props = defineProps<{
    modelValue: string
    disabled?: boolean
    placeholder?: string
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void
  }>()

  const appStore = useAppStore()
  let editorView: any = null

  // Use the same Prometheus API base URL as in metrics.ts
  const prometheusBaseURL = '/v1/prometheus/api/v1'

  // Helper function to create a Response-like object with proper body stream
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
      url: '', // This URL is not used by the extension, it uses the one from the original request
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

  // Helper function to normalize URL paths
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

  // Custom HTTP client for GreptimeDB API
  const myHTTPClient = async (resource: any, options: any = {}): Promise<Response> => {
    console.log('PromQL fetchFn called with:', resource, options)

    const requestUrl = normalizeUrl(resource)

    // Skip metadata requests as GreptimeDB doesn't support this endpoint
    if (requestUrl.includes('/metadata')) {
      console.log('Ignoring metadata request - not supported by GreptimeDB')
      return createResponse({ status: 'success', data: {} })
    }

    console.log('Making request to:', requestUrl)

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

      console.log('PromQL API response:', response.status, response.data)

      // Format response data based on endpoint type
      let responseData = { status: 'success', data: response.data }

      // Handle different endpoint types
      if (
        requestUrl.includes('/label/__name__/values') ||
        requestUrl.includes('/labels') ||
        (requestUrl.includes('/label/') && requestUrl.includes('/values'))
      ) {
        // For metric names, label names, and label values - wrap array in prometheus format
        responseData = { status: 'success', data: response.data }

        // Ensure data is an array
        if (!Array.isArray(response.data)) {
          responseData.data = []
        }
      } else if (requestUrl.includes('/series')) {
        // For series requests (used for label suggestions) - return raw series objects
        responseData = { status: 'success', data: response.data }

        // Ensure data is an array
        if (!Array.isArray(response.data)) {
          responseData.data = []
        }
      } else {
        // Default case - wrap in prometheus format
        responseData = { status: 'success', data: response.data }

        if (!Array.isArray(response.data)) {
          responseData.data = []
        }
      }

      console.log('Formatted response for PromQL extension:', responseData)
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
    console.log('Initializing PromQL extension')

    promqlExtension.value = new PromQLExtension()
      .activateCompletion(true)
      .activateLinter(true)
      .setComplete({
        remote: {
          url: '',
          fetchFn: myHTTPClient,
          lookbackInterval: 60 * 60 * 1000, // 1 hour
        },
      })
      .asExtension()
  }

  // Custom keymap to prevent Enter from creating new lines (Prometheus UI style)
  const singleLineKeymap = Prec.highest(
    keymap.of([
      {
        key: 'Enter',
        run: () => true, // Prevent default behavior - no new lines
      },
    ])
  )

  // Extensions array
  const extensions = computed(() => {
    const exts = [basicSetup, singleLineKeymap]

    if (promqlExtension.value) {
      exts.push(promqlExtension.value)
    }

    return exts
  })

  // Handle code changes
  const codeUpdate = (content: string) => {
    emit('update:modelValue', content)
  }

  // Handle editor ready
  const onEditorReady = (payload: any) => {
    editorView = payload.view
    console.log('PromQL editor ready:', editorView)
  }

  // Public method to insert text at cursor
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

  // Focus the editor
  const focus = () => {
    if (editorView) {
      editorView.focus()
    }
  }

  // Get current cursor position
  const getCursorPosition = () => {
    if (!editorView) return 0
    return editorView.state.selection.main.head
  }

  // Get current text
  const getText = () => {
    if (!editorView) return ''
    return editorView.state.doc.toString()
  }

  // Watch for database changes and refresh extension
  watch(
    () => appStore.database,
    () => {
      console.log('Database changed, reinitializing PromQL extension')
      initializePromQLExtension()
    }
  )

  // Initialize on mount
  onMounted(() => {
    initializePromQLExtension()
  })

  // Expose methods for parent component
  defineExpose({
    insertTextAtCursor,
    focus,
    getCursorPosition,
    getText,
  })
</script>

<style lang="less" scoped>
  :deep(.arco-card.light-editor-card) {
    padding-right: 0;
  }
  :deep(.arco-card-body) {
    height: 100%;
  }
  :deep(.cm-focused) {
    outline: none;
  }

  // Active outline when focused
  :deep(.cm-editor.cm-focused) {
    border: 2px solid var(--color-primary);
    border-radius: 4px;
    box-shadow: 0 0 0 2px rgba(var(--color-primary-rgb), 0.1);
  }

  // Smooth transition for focus state
  :deep(.cm-editor) {
    border: 1px solid var(--color-border);
    border-radius: 4px;
    transition: all 0.2s ease-in-out;
  }

  // Single line editor styles (Prometheus UI style)
  :deep(.cm-editor) {
    height: 40px;
    overflow: visible;
  }

  :deep(.cm-scroller) {
    overflow: visible;
  }

  :deep(.cm-content) {
    line-height: 40px;
    padding: 0 8px;
    min-height: 40px;
  }

  :deep(.cm-line) {
    padding: 0;
  }
  :deep(.cm-activeLine) {
    background-color: transparent;
  }

  // Hide line numbers like Prometheus UI
  :deep(.cm-gutters) {
    display: none !important;
  }

  :deep(.cm-lineNumbers) {
    display: none !important;
  }

  // Ensure autocomplete popup is visible
  :deep(.cm-tooltip) {
    z-index: 1000;
  }

  :deep(.cm-tooltip.cm-completionInfo) {
    z-index: 1001;
  }

  // Prometheus UI style autocomplete popup
  :deep(.cm-tooltip.cm-tooltip-autocomplete) {
    background-color: #f8f8f8;
    border: 1px solid rgba(52, 79, 113, 0.2);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

    & > ul {
      max-height: 350px;
      font-family: 'DejaVu Sans Mono', monospace;
      max-width: unset;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    & > ul > li {
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid rgba(52, 79, 113, 0.1);

      &:hover {
        background-color: #ddd;
      }

      &[aria-selected] {
        background-color: #d6ebff;
        color: unset;
      }

      &:last-child {
        border-bottom: none;
      }
    }

    min-width: 30%;
  }

  // Prometheus UI style completion info popup
  :deep(.cm-tooltip.cm-completionInfo) {
    background-color: #d6ebff;
    border: 1px solid rgba(52, 79, 113, 0.2);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    margin-top: -11px;
    padding: 12px;
    font-family: 'Open Sans', 'Lucida Sans Unicode', 'Lucida Grande', sans-serif;
    min-width: 250px;
    max-width: min-content;
    z-index: 1001;
  }

  // Prometheus UI style completion icons
  :deep(.cm-completionIcon) {
    box-sizing: content-box;
    font-size: 16px;
    line-height: 1;
    margin-right: 10px;
    vertical-align: top;
    color: #007acc;
    opacity: 1;
  }

  // Prometheus UI style matched text highlighting
  :deep(.cm-completionMatchedText) {
    color: #0066bf;
    text-decoration: none;
    font-weight: bold;
  }

  // Prometheus UI style completion details
  :deep(.cm-completionDetail) {
    float: right;
    color: #999;
    font-size: 12px;
  }
</style>
