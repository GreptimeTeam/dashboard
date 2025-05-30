<template lang="pug">
.trace-detail-container
  .page-header
    .header-content
      a-button(type="text" @click="handleBack")
        icon-left
        span Back
      h2 Trace Details
  .content-container
    a-card.light-editor-card(title="Trace Information" :bordered="false")
      .right-content
        a-descriptions(layout="inline-horizontal" :data="traceInfo" :column="2")
          template(#trace_id)
            a-typography-text(type="primary") {{ traceInfo.trace_id }}
          template(#status)
            a-tag(:color="getStatusColor(traceInfo.status)") {{ traceInfo.status }}
          template(#duration)
            | {{ formatDuration(traceInfo.duration) }}
          template(#start_time)
            | {{ formatTime(traceInfo.start_time) }}

    a-card.light-editor-card(title="Trace Timeline" :bordered="false")
      .right-content
        .timeline-container
          a-spin(:loading="loading")
            a-timeline
              a-timeline-item(v-for="span in traceSpans" :key="span.span_id" :color="getStatusColor(span.status)")
                template(#dot)
                  a-avatar(:size="24" :style="{ backgroundColor: getStatusColor(span.status) }")
                    template(#icon)
                      component(:is="getSpanIcon(span.type)")
                template(#content)
                  .span-content
                    .span-header
                      span.span-name {{ span.name }}
                      a-tag(size="small") {{ span.service_name }}
                    .span-details
                      span.span-time {{ formatTime(span.start_time) }}
                      span.span-duration ({{ formatDuration(span.duration) }})
                    .span-attributes(v-if="Object.keys(span.attributes).length")
                      a-space
                        a-tag(v-for="(value, key) in span.attributes" :key="key" size="small") {{ key }}: {{ value }}

    a-card.light-editor-card(title="Trace Attributes" :bordered="false")
      .right-content
        a-table(:columns="attributeColumns" :data="attributeData" :pagination="false")
</template>

<script setup name="TraceDetail" lang="ts">
  import { ref, reactive, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { IconCode, IconStorage, IconLink, IconLeft } from '@arco-design/web-vue/es/icon'
  import editorAPI from '@/api/editor'

  const route = useRoute()
  const router = useRouter()
  const loading = ref(false)

  interface Span {
    span_id: string
    trace_id: string
    parent_span_id: string
    service_name: string
    name: string
    start_time: number
    duration: number
    status: string
    attributes: Record<string, any>
  }

  const traceInfo = reactive({
    trace_id: route.params.id,
    service_name: '',
    operation_name: '',
    start_time: 0,
    duration: 0,
    status: '',
  })

  const traceSpans = ref<Span[]>([])
  const rootSpan = ref<Span | null>(null)

  async function fetchTraceData() {
    loading.value = true
    try {
      const tableName = (route.query.table as string) || 'spans'
      const result = await editorAPI.runSQL(`
        SELECT 
          span_id,
          trace_id,
          parent_span_id,
          service_name,
          span_name as name,
          timestamp as start_time,
          duration_nano as duration,
          status,
          attributes
        FROM ${tableName}
        WHERE trace_id = '${route.params.id}'
        ORDER BY start_time ASC
      `)

      if (result.output?.[0]?.records) {
        const records = result.output[0].records as unknown as {
          schema: { column_schemas: Array<{ name: string; data_type: string }> }
          rows: any[][]
        }

        traceSpans.value = records.rows.map((row: any[]) => {
          const span: Span = {
            span_id: row[0],
            trace_id: row[1],
            parent_span_id: row[2],
            service_name: row[3],
            name: row[4],
            start_time: row[5],
            duration: row[6],
            status: row[7],
            attributes: row[8] ? JSON.parse(row[8]) : {},
          }
          return span
        })

        // Find root span (span with no parent)
        rootSpan.value = traceSpans.value.find((span) => !span.parent_span_id) || null

        if (rootSpan.value) {
          // Update trace info from root span
          traceInfo.service_name = rootSpan.value.service_name
          traceInfo.operation_name = rootSpan.value.name
          traceInfo.start_time = rootSpan.value.start_time
          traceInfo.duration = rootSpan.value.duration
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

  // Utility functions
  function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleString()
  }

  function formatDuration(duration: number) {
    return `${duration}ms`
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

  onMounted(() => {
    fetchTraceData()
  })
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

  .right-content {
    padding: 0 10px 10px 10px;
    height: 100%;
    display: flex;
    flex-direction: column;
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

  .span-content {
    .span-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .span-name {
      font-weight: 500;
    }

    .span-details {
      color: var(--color-text-3);
      font-size: 12px;
      margin-bottom: 4px;
    }

    .span-attributes {
      margin-top: 4px;
    }
  }
</style>
