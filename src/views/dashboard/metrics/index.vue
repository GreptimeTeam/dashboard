<template lang="pug">
a-layout.new-layout
  a-resize-box(
    v-model:width="sidebarWidth"
    :directions="['right']"
    :style="{ 'min-width': '100px', 'max-width': '40vw' }"
  )
    a-layout-sider(:width="actualSidebarWidth")
      a-card.metrics-sidebar(:bordered="false")
        template(#title)
          a-space(:size="10")
            | Metrics Explorer
            a-button(
              type="outline"
              size="small"
              :loading="loading"
              @click="refreshData"
            )
              template(#icon)
                svg.icon.brand-color
                  use(href="#refresh")

        MetricSidebar(@copyText="handleCopyText" @insertText="handleInsertText")

  a-layout-content.layout-content
    a-space.layout-space(direction="vertical" fill :size="0")
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, watch, nextTick } from 'vue'
  import { useStorage } from '@vueuse/core'
  import { useMetrics } from '@/hooks/use-metrics'
  import { Message } from '@arco-design/web-vue'
  import dayjs from 'dayjs'
  import MetricSidebar from './components/MetricSidebar.vue'

  // Use the metrics composable
  const {
    metrics,
    labels,
    loading,
    error,
    currentQuery,
    queryResult,
    rangeQueryResult,
    timeRange,
    fetchMetrics,
    fetchLabels,
    fetchLabelValues,
    executeQuery,
    executeRangeQuery,
    clearResults,
    // new
    searchMetrics,
  } = useMetrics()

  // Sidebar state
  const sidebarWidth = useStorage('metrics-sidebar-width', 320)

  // Computed properties
  const actualSidebarWidth = computed(() => {
    const minWidth = 100
    const maxWidth = window.innerWidth * 0.4
    return Math.max(minWidth, Math.min(sidebarWidth.value, maxWidth))
  })

  // Initialize
  fetchMetrics()

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      Message.success('Copied to clipboard')
    } catch (err) {
      Message.error('Failed to copy to clipboard')
    }
  }

  const handleInsertText = (text: string) => {
    if (currentQuery.value.includes('{')) {
      // Insert into existing label selector
      const insertPos = currentQuery.value.lastIndexOf('}')
      const separator = currentQuery.value.slice(insertPos - 1, insertPos) === ',' ? '' : ','
      const beforeInsert = currentQuery.value.slice(0, insertPos)
      const afterInsert = currentQuery.value.slice(insertPos)
      currentQuery.value = beforeInsert + separator + text + afterInsert
    } else {
      // Create new label selector or append
      const metricMatch = currentQuery.value.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)/)
      if (metricMatch) {
        currentQuery.value = `${metricMatch[1]}{${text}}`
      } else if (currentQuery.value.trim()) {
        currentQuery.value += `{${text}}`
      } else {
        currentQuery.value = `{${text}}`
      }
    }
  }
</script>

<style lang="less" scoped></style>
