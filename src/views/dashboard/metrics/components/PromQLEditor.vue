<template lang="pug">
a-card.promql-editor-card
  CodeMirror(
    :placeholder="placeholder"
    :modelValue="props.modelValue"
    :extensions="extensions"
    :style="style"
    :spellcheck="false"
    :autofocus="false"
    :indent-with-tab="true"
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

  // Extensions array
  const extensions = computed(() => {
    const exts = [basicSetup]

    if (promqlExtension.value) {
      exts.push(promqlExtension.value)
    }

    return exts
  })

  // Editor style
  const style = {
    height: '120px',
  }

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
</style>
