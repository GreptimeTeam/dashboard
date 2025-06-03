<template lang="pug">
.trace-detail-container
  .page-header
    .header-content
      a-button(type="text" @click="handleBack")
        icon-left
        span Back
      h2 Trace Details
  .content-container
    a-card.light-editor-card(title="Trace Timeline" :bordered="false")
      .timeline-header(style="display: flex; align-items: stretch")
        .span-name(:style="headerStyle") Operation Name
        .time-ticks
          .tick(v-for="(tick, index) in 4" :key="index")
            .tick-label {{ formatTickTime(index) }}
            .tick-label(v-if="index === 3" style="text-align: right") {{ formatDuration(rootSpan?.duration_nano || 0) }}
      a-spin.spin-block(:loading="loading")
        a-tree(
          :key="spanTree.length ? spanTree[0].span_id : ''"
          ref="treeRef"
          blockNode
          default-expand-all
          :data="spanTree"
        )
          template(#title="data")
            .span-item
              .span-info(:style="getSpanInfoStyle(data._level)")
                span.span-name {{ data.span_name }}
                a-tag(size="small") {{ data.service_name }}
              .span-timeline
                .time-bar-container
                  .time-bar(
                    :style=`{
                          left: getRelativePosition(data) + '%',
                          width: getDurationWidth(data) + '%'
                        }`
                    :class="{ error: data.status === 'error' }"
                  )
                    .time-info
                      span.span-duration {{ formatDuration(data.duration_nano) }}

    a-card.light-editor-card(title="Trace Attributes" :bordered="false")
      a-table(:columns="attributeColumns" :data="attributeData" :pagination="false")
</template>

<script setup name="TraceDetail" lang="ts">
  import { ref, reactive, onMounted, computed, nextTick } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { IconCode, IconStorage, IconLink, IconLeft } from '@arco-design/web-vue/es/icon'
  import editorAPI from '@/api/editor'

  const route = useRoute()
  const router = useRouter()
  const loading = ref(false)
  const spanInfoWidth = ref(300)

  // Utility functions
  function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleString()
  }

  function formatDuration(duration: number) {
    const ms = duration / 1_000_000 // Convert nanoseconds to milliseconds
    return `${ms.toFixed(2)}ms`
  }

  function getStatusColor(status: string) {
    const colors = {
      success: 'green',
      error: 'red',
      warning: 'orange',
    }
    return colors[status] || 'blue'
  }

  function getSpanIcon(type: string) {
    const icons = {
      http: IconCode,
      database: IconStorage,
      api: IconLink,
    }
    return icons[type] || IconCode
  }

  // Dynamic type based on column schemas
  type Span = Record<string, any>

  const traceInfo = reactive({
    trace_id: route.params.id,
    service_name: '',
    operation_name: '',
    start_time: 0,
    duration: 0,
    status: '',
  })

  const traceInfoData = computed(() => [
    { label: 'Trace ID', value: String(traceInfo.trace_id) },
    { label: 'Service', value: traceInfo.service_name },
    { label: 'Operation', value: traceInfo.operation_name },
    { label: 'Status', value: traceInfo.status },
    { label: 'Duration', value: formatDuration(traceInfo.duration) },
    { label: 'Start Time', value: formatTime(traceInfo.start_time) },
  ])

  const traceSpans = ref<Span[]>([])
  const spanTree = ref<Span[]>([])
  const rootSpan = ref<Span | null>(null)
  const traceStartTime = ref(0)
  const traceEndTime = ref(0)

  const treeRef = ref()

  function buildSpanTree(spans: Span[]): Span[] {
    const spanMap = new Map<string, Span>()
    const tree: Span[] = []

    // First pass: create a map of all spans by their ID
    spans.forEach((span) => {
      spanMap.set(span.span_id, { ...span, children: [], _level: 0, key: span.span_id, title: span.span_name })
    })

    // Second pass: build the tree structure
    spans.forEach((span) => {
      const spanWithChildren = spanMap.get(span.span_id)!
      if (!span.parent_span_id) {
        // This is a root span
        tree.push(spanWithChildren)
      } else {
        // This is a child span
        const parentSpan = spanMap.get(span.parent_span_id)
        if (parentSpan) {
          parentSpan.children = parentSpan.children || []
          parentSpan.children.push(spanWithChildren)
        } else {
          // Parent not found, treat as root
          tree.push(spanWithChildren)
        }
      }
    })

    // Calculate absolute levels for all nodes
    function calculateLevels(node: Span, level: number) {
      node._level = level
      if (node.children && node.children.length > 0) {
        node.children.forEach((child) => calculateLevels(child, level + 1))
      }
    }

    // Start level calculation from root nodes
    tree.forEach((node) => calculateLevels(node, 0))

    // Sort children by start time
    function sortChildren(node: Span) {
      if (node.children && node.children.length > 0) {
        node.children.sort((a, b) => {
          const timeA = a.start_time || a.timestamp
          const timeB = b.start_time || b.timestamp
          return timeA - timeB
        })
        node.children.forEach(sortChildren)
      }
    }

    tree.forEach(sortChildren)
    return tree
  }

  function getRelativePosition(span: Span): number {
    if (!traceStartTime.value || !traceEndTime.value) return 0
    const spanTime = span.timestamp
    return ((spanTime - traceStartTime.value) / (traceEndTime.value - traceStartTime.value)) * 100
  }

  function getDurationWidth(span: Span): number {
    if (!traceStartTime.value || !traceEndTime.value) return 0
    return (span.duration_nano / (traceEndTime.value - traceStartTime.value)) * 100
  }

  async function fetchTraceData() {
    loading.value = true
    try {
      const tableName = (route.query.table as string) || 'spans'
      const result = await editorAPI.runSQL(`
        SELECT *
        FROM ${tableName}
        WHERE trace_id = '${route.params.id}'
        ORDER BY timestamp DESC
      `)

      if (result.output?.[0]?.records) {
        const records = result.output[0].records as unknown as {
          schema: { column_schemas: Array<{ name: string; data_type: string }> }
          rows: any[][]
        }

        // Create a map of column names to their indices
        const columnMap = records.schema.column_schemas.reduce((acc, col, index) => {
          acc[col.name] = index
          return acc
        }, {} as Record<string, number>)

        traceSpans.value = records.rows.map((row: any[]) => {
          const span: Span = {}
          records.schema.column_schemas.forEach((col) => {
            const value = row[columnMap[col.name]]
            // Handle special cases for certain columns
            if (col.name === 'attributes' && value) {
              span[col.name] = JSON.parse(value)
            } else {
              span[col.name] = value
            }
          })
          return span
        })

        // Calculate trace time range
        const timestamps = traceSpans.value.map((span) => span.timestamp)
        traceStartTime.value = Math.min(...timestamps)
        traceEndTime.value = traceStartTime.value + Math.max(...traceSpans.value.map((span) => span.duration_nano))

        // Build the span tree
        spanTree.value = buildSpanTree(traceSpans.value)
        console.log(spanTree.value, 'spanTree')

        // Find root span (span with no parent)
        rootSpan.value = traceSpans.value.find((span) => !span.parent_span_id) || null
        console.log(
          traceStartTime.value,
          traceEndTime.value,
          'traceStartTime, traceEndTime',
          traceEndTime.value - traceStartTime.value,
          rootSpan.value.duration_nano
        )
        if (rootSpan.value) {
          console.log(rootSpan.value, 'rootSpan')
          // Update trace info from root span
          traceInfo.service_name = rootSpan.value.service_name
          traceInfo.operation_name = rootSpan.value.span_name
          traceInfo.start_time = rootSpan.value.timestamp
          traceInfo.duration = rootSpan.value.duration_nano
          traceInfo.status = rootSpan.value.status
        }
      }
    } catch (error) {
      console.error('Failed to fetch trace data:', error)
    } finally {
      loading.value = false
    }
  }

  const attributeColumns = [
    {
      title: 'Key',
      dataIndex: 'key',
    },
    {
      title: 'Value',
      dataIndex: 'value',
    },
  ]

  const attributeData = ref([
    { key: 'user_id', value: '123' },
    { key: 'region', value: 'us-west' },
    { key: 'environment', value: 'production' },
  ])

  const handleBack = () => {
    console.log('Back button clicked')
    router.push({ name: 'trace-query' })
  }

  const headerStyle = computed(() => ({
    width: `${spanInfoWidth.value + 35}px`,
    minWidth: `${spanInfoWidth.value}px`,
  }))

  const getSpanInfoStyle = (level: number) => ({
    width: `calc(${spanInfoWidth.value}px - ${level * 22}px)`,
    minWidth: `calc(${spanInfoWidth.value}px - ${level * 22}px)`,
  })

  function formatTickTime(index: number): string {
    if (!rootSpan.value) return ''
    const duration = rootSpan.value.duration_nano
    const tickTime = (duration * index) / 4
    return formatDuration(tickTime)
  }

  fetchTraceData()
</script>

<style lang="less" scoped>
  .trace-detail-container {
    height: calc(100vh - 133px);
    overflow: auto;
  }

  .page-header {
    padding: 16px 16px 0;
    border-bottom: 1px solid var(--color-border);

    .header-content {
      display: flex;
      align-items: center;
      gap: 8px;

      h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 500;
      }

      :deep(.arco-btn) {
        display: flex;
        align-items: center;
        gap: 4px;
      }
    }
  }

  .content-container {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-bottom: 16px;
  }

  :deep(.arco-card) {
    border-radius: 0;
    border-bottom: none;
  }

  :deep(.arco-card-body) {
    padding: 0 10px 10px 10px;
  }

  :deep(.arco-card.light-editor-card) {
    padding-right: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .timeline-container {
    flex: 1;
    min-height: 0;
    margin-top: 5px;
    overflow: auto;
  }

  .timeline-header {
    padding: 0;
    border: 1px solid var(--color-border);
    margin-bottom: 8px;
    font-weight: 500;
    color: var(--color-text-2);
    background-color: var(--color-fill-2);
    display: flex;
    align-items: stretch;

    .span-name {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      padding: 8px 8px;
    }
  }

  .time-ticks {
    pointer-events: none;
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    width: 100%;

    .tick {
      flex: 1;
      display: flex;
      justify-content: space-between;
      border-left: 1px solid var(--color-border);
      padding: 4px 4px;
      align-items: center;

      .tick-label {
        font-size: 12px;
        color: var(--color-text-3);
      }
    }
  }

  .span-item {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    position: relative;

    .span-info {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .span-timeline {
      flex: 1;
      position: relative;
      height: 24px;
      border-radius: 4px;

      .time-bar-container {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
      }

      .time-bar {
        position: absolute;
        height: 6px;
        top: 50%;
        transform: translateY(-50%);
        background-color: var(--color-primary);
        border-radius: 2px;
        transition: all 0.2s;

        &.error {
          background-color: var(--color-danger-light-1);
        }

        .time-info {
          position: absolute;
          right: 0;
          top: -16px;
          white-space: nowrap;
          color: var(--color-text-3);
          font-size: 12px;
        }
      }
    }
  }

  :deep(.arco-tree-node) {
    padding: 0 0;
  }

  :deep(.arco-tree-node-content) {
    padding: 4px 8px;
    border-radius: 4px;
    transition: background-color 0.2s;

    &:hover {
      background-color: var(--color-fill-2);
    }
  }

  :deep(.arco-tree-node-title) {
    display: block;
    width: 100%;
  }

  .spin-block {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
