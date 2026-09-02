<template lang="pug">
.related-logs-panel
  a-spin(:loading="loading")
    a-alert(
      v-if="!canShow"
      type="info"
      show-icon
      :title="t('drilldown.relatedLogs.emptyTitle')"
      :description="t('drilldown.relatedLogs.emptyDescription')"
    )
    template(v-else)
      .related-logs-meta
        span {{ t('drilldown.relatedLogs.count', { count }) }}
        span.table-name {{ logsTable }}
      a-table(
        size="small"
        :pagination="false"
        :bordered="false"
        :columns="columns"
        :data="tableData"
      )
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { canShowRelatedLogs, relatedLogsCount, relatedLogsPreview } from '@/observability/adapters/logs'

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const loading = ref(false)
  const count = ref(0)
  const previewRows = ref<string[][]>([])

  const logsTable = computed(() => ctx.logsTable.value ?? '')
  const canShow = computed(() => canShowRelatedLogs(ctx))

  const columns = computed(() => {
    if (!previewRows.value.length) {
      return [{ title: t('drilldown.relatedLogs.column'), dataIndex: 'col0' }]
    }
    const columnCount = previewRows.value[0]?.length ?? 1
    return Array.from({ length: columnCount }, (_, index) => ({
      title: t('drilldown.relatedLogs.column') + (columnCount > 1 ? ` ${index + 1}` : ''),
      dataIndex: `col${index}`,
    }))
  })

  const tableData = computed(() =>
    previewRows.value.map((row, rowIndex) => {
      const record: Record<string, string> = { key: String(rowIndex) }
      row.forEach((cell, cellIndex) => {
        record[`col${cellIndex}`] = cell
      })
      return record
    })
  )

  const loadRelatedLogs = async () => {
    if (!canShowRelatedLogs(ctx)) {
      count.value = 0
      previewRows.value = []
      return
    }

    loading.value = true
    try {
      count.value = await relatedLogsCount(ctx)
      previewRows.value = await relatedLogsPreview(ctx)
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    loadRelatedLogs()
  })

  watch(
    () => [
      ctx.filters.value,
      ctx.logsTable.value,
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      ctx.refreshKey.value,
    ],
    () => {
      loadRelatedLogs()
    },
    { deep: true }
  )
</script>

<style scoped lang="less">
  .related-logs-panel {
    padding: 8px 0;
  }

  .related-logs-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    font-size: 13px;
    color: var(--color-text-2);
  }

  .table-name {
    color: var(--color-text-3);
    font-size: 12px;
  }
</style>
