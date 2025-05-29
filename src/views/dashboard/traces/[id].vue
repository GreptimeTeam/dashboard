<template lang="pug">
a-page-header(title="Trace Details" @back="handleBack")

a-layout.full-height-layout(style="box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.08)")
  a-layout-content
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
  import { IconCode, IconStorage, IconLink } from '@arco-design/web-vue/es/icon'

  const route = useRoute()
  const router = useRouter()

  // Mock data for demonstration
  const traceInfo = reactive({
    trace_id: route.params.id,
    service_name: 'user-service',
    operation_name: 'get_user',
    start_time: new Date().getTime(),
    duration: 150,
    status: 'success',
  })

  const traceSpans = ref([
    {
      span_id: 'span-1',
      name: 'HTTP GET /api/users',
      service_name: 'user-service',
      type: 'http',
      start_time: new Date().getTime() - 100,
      duration: 50,
      status: 'success',
      attributes: {
        method: 'GET',
        url: '/api/users',
        status_code: '200',
      },
    },
    {
      span_id: 'span-2',
      name: 'Database Query',
      service_name: 'user-service',
      type: 'database',
      start_time: new Date().getTime() - 50,
      duration: 30,
      status: 'success',
      attributes: {
        query: 'SELECT * FROM users WHERE id = ?',
        rows: '1',
      },
    },
  ])

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

  // Handlers
  function handleBack() {
    router.back()
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
    // TODO: Fetch actual trace data using the ID
  })
</script>

<style lang="less" scoped>
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

  .content-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-bottom: 16px;
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

  .full-height-layout {
    height: calc(100vh - 133px);

    :deep(.arco-layout) {
      height: 100%;
    }

    :deep(.arco-layout-content) {
      height: 100%;
      overflow: auto;
    }

    :deep(.arco-card-body) {
      padding: 0;
      height: 100%;
    }
  }
</style>
