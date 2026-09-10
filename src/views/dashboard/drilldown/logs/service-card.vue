<template lang="pug">
.service-card
  .card-header
    .card-title-row(:title="displayName")
      span.card-title {{ displayName }}
      span.card-count {{ countLabel }}
    a-button.card-select(type="outline" size="mini" @click="selectService")
      | {{ t('drilldown.logs.selectService') }}
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'

  const props = defineProps<{
    groupKey: string
    count: number
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const displayName = computed(() => {
    if (!props.groupKey) {
      return t('drilldown.logs.allLogs')
    }
    return props.groupKey
  })

  const countLabel = computed(() => t('drilldown.logs.logCount', { count: props.count }))

  const resolveFilterKey = (): string => {
    const fieldMap = ctx.fieldMap.value.logs
    const groupCol = fieldMap.primaryGroupBy
    if (fieldMap.service && fieldMap.service === groupCol) {
      return 'service'
    }
    return groupCol || 'service'
  }

  const selectService = () => {
    const filterKey = resolveFilterKey()
    const groupCol = ctx.fieldMap.value.logs.primaryGroupBy
    // Ensure chip key maps to the physical column for SQL.
    if (groupCol && !ctx.fieldMap.value.logs[filterKey]) {
      ctx.fieldMap.value = {
        ...ctx.fieldMap.value,
        logs: { ...ctx.fieldMap.value.logs, [filterKey]: groupCol },
      }
    }

    const value = props.groupKey || 'unknown'
    if (groupCol) {
      ctx.appendFilter({ key: filterKey, op: '=', value })
    }
    ctx.openLogsDetail(value)
  }
</script>

<style scoped lang="less">
  .service-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 72px;
    padding: 12px;
    border: 1px solid var(--color-border-2);
    border-radius: 8px;
    background: var(--color-bg-2);
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .card-title-row {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    overflow: hidden;
  }

  .card-title {
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    color: var(--color-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-count {
    font-size: 12px;
    color: var(--color-text-3);
  }

  .card-select {
    flex-shrink: 0;
  }
</style>
