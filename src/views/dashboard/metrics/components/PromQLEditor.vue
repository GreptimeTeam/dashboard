<template lang="pug">
.promql-editor
  .editor-container(ref="editorContainer")
</template>

<script setup lang="ts">
  import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
  import { EditorView, basicSetup } from 'codemirror'
  import { EditorState } from '@codemirror/state'
  import { PromQLExtension } from '@prometheus-io/codemirror-promql'
  import { useAppStore } from '@/store'
  import axios from 'axios'

  const props = defineProps<{
    modelValue: string
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void
  }>()

  const appStore = useAppStore()
  const editorContainer = ref<HTMLElement>()
  let editorView: EditorView | null = null

  // Use the same Prometheus API base URL as in metrics.ts
  const prometheusBaseURL = '/v1/prometheus/api/v1'

  // Initialize CodeMirror editor
  const initializeEditor = async () => {
    if (!editorContainer.value) return

    console.log('Initializing PromQL editor')

    // Helper function to create a Response-like object with proper body stream
    const createResponse = (response: any, status = 200, statusText = 'OK'): Response => {
      const responseBody = JSON.stringify(response)
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
        clone: () => ({ ...response, body: bodyStream }),
        json: async () => response,
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
        // If it's already a full URL (starts with http), use as is
        if (requestUrl.startsWith('http')) {
          return requestUrl
        }
        // If it starts with our prometheus base path, use as is
        if (requestUrl.startsWith('/v1/prometheus/api/v1/')) {
          return requestUrl
        }
        // If it's a standard Prometheus API path (starts with /api/v1/), convert it
        if (requestUrl.startsWith('/api/v1/')) {
          return `/v1/prometheus${requestUrl}`
        }
        // If it's just a relative path, add full base
        if (requestUrl.startsWith('/')) {
          return `${prometheusBaseURL}${requestUrl}`
        }
        // If it's not a path at all, treat as relative to base
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
            db: appStore.database, // Add database parameter
          },
        }

        // Add any query parameters from options
        if (params) {
          config.params = { ...config.params, ...params }
        }

        // Handle POST body
        if (body) {
          config.data = body
        }

        const response = await axios({
          url: requestUrl,
          ...config,
        })

        console.log('PromQL API response:', response.status, response.data)

        // Format response data based on endpoint type
        const responseData = { status: 'success', data: response.data }

        // Ensure data is an array for all endpoints
        if (!Array.isArray(response.data)) {
          responseData.data = []
        }

        console.log('Formatted response for PromQL extension:', responseData)
        console.log(responseData.data)
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

    // Fetch metrics once for cache-based completion (like the working example)
    let initialMetrics: string[] = []
    try {
      const response = await axios.get(`${prometheusBaseURL}/label/__name__/values`, {
        params: { db: appStore.database },
      })
      if (response.data && Array.isArray(response.data)) {
        initialMetrics = response.data
        console.log('Loaded metrics for cache-based completion:', initialMetrics.length, 'items')
      }
    } catch (error) {
      console.warn('Failed to fetch metrics for cache:', error)
    }

    // Create PromQL extension with hybrid completion (cache for metrics, remote for labels)
    const promqlExtension = new PromQLExtension()
      .activateCompletion(true)
      .activateLinter(true)
      .setComplete({
        remote: {
          url: '', // Empty to prevent URL duplication
          fetchFn: myHTTPClient, // Enable remote fetch for labels and values
          lookbackInterval: 60 * 60 * 1000, // 1 hour
        },
      })

    const startState = EditorState.create({
      doc: props.modelValue || '',
      extensions: [
        basicSetup,
        promqlExtension.asExtension(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newValue = update.state.doc.toString()
            emit('update:modelValue', newValue)
          }
        }),
        EditorView.theme({
          '&': {
            fontSize: '14px',
            fontFamily: '"Courier New", "Monaco", monospace',
          },
          '.cm-content': {
            padding: '12px',
            minHeight: '100px',
          },
          '.cm-focused': {
            outline: '1px solid var(--color-primary-light-1)',
            outlineOffset: '-1px',
          },
          '.cm-editor': {
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
          },
          '.cm-scroller': {
            fontFamily: '"Courier New", "Monaco", monospace',
          },
          // Autocomplete styling
          '.cm-tooltip-autocomplete': {
            background: 'var(--color-bg-popup)',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          },
        }),
      ],
    })

    editorView = new EditorView({
      state: startState,
      parent: editorContainer.value,
    })

    console.log('PromQL editor initialized successfully')
  }

  // Watch for database changes and reinitialize
  watch(
    () => appStore.database,
    () => {
      if (editorView) {
        console.log('Database changed, recreating PromQL editor')
        editorView.destroy()
        editorView = null
        nextTick(() => {
          initializeEditor()
        })
      }
    }
  )

  // Watch for external value changes
  watch(
    () => props.modelValue,
    (newValue) => {
      if (editorView && newValue !== editorView.state.doc.toString()) {
        editorView.dispatch({
          changes: {
            from: 0,
            to: editorView.state.doc.length,
            insert: newValue || '',
          },
        })
      }
    }
  )

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

  // Force trigger autocomplete for testing
  const triggerAutocomplete = () => {
    if (editorView) {
      console.log('Manually triggering autocomplete')
      // This is a test function to manually trigger autocomplete
      const { state } = editorView
      const pos = state.selection.main.head
      editorView.dispatch({
        changes: { from: pos, insert: ' ' },
      })
      nextTick(() => {
        editorView?.dispatch({
          changes: { from: pos, to: pos + 1, insert: '' },
        })
      })
    }
  }

  onMounted(() => {
    nextTick(() => {
      initializeEditor()
    })
  })

  onUnmounted(() => {
    if (editorView) {
      editorView.destroy()
      editorView = null
    }
  })

  // Expose methods for parent component
  defineExpose({
    insertTextAtCursor,
    focus,
    getCursorPosition,
    getText,
    triggerAutocomplete,
  })
</script>

<style scoped lang="less">
  .promql-editor {
    .editor-container {
      position: relative;

      :deep(.cm-editor) {
        background: var(--color-bg-container);

        &.cm-focused {
          border-color: var(--color-primary-light-1);
        }
      }

      :deep(.cm-content) {
        color: var(--color-text-primary);
      }

      :deep(.cm-cursor) {
        border-left-color: var(--color-text-primary);
      }

      :deep(.cm-selectionBackground) {
        background: var(--color-primary-light-4);
      }

      /* PromQL syntax highlighting */
      :deep(.cm-promql-keyword) {
        color: var(--color-primary);
        font-weight: 600;
      }

      :deep(.cm-promql-metric) {
        color: var(--color-success);
        font-weight: 500;
      }

      :deep(.cm-promql-label) {
        color: var(--color-warning);
      }

      :deep(.cm-promql-string) {
        color: var(--color-info);
      }

      :deep(.cm-promql-number) {
        color: var(--color-danger);
      }

      :deep(.cm-promql-operator) {
        color: var(--color-text-secondary);
        font-weight: 600;
      }

      /* Autocomplete popup styling */
      :deep(.cm-tooltip-autocomplete) {
        background: var(--color-bg-popup);
        border: 1px solid var(--color-border);
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

        .cm-completionOption {
          padding: 8px 12px;

          &[aria-selected='true'] {
            background: var(--color-bg-hover);
          }
        }

        .cm-completionLabel {
          font-family: 'Courier New', 'Monaco', monospace;
          font-weight: 500;
        }

        .cm-completionDetail {
          color: var(--color-text-secondary);
          font-size: 12px;
        }
      }
    }
  }
</style>
