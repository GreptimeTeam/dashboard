<template lang="pug">
.logs-detail-filters(v-if="visible")
  .filter-item(v-if="columns.body && logsTab === 'logs'")
    span.filter-label {{ columns.body }}
    a-select.filter-op(size="small" :model-value="logsBodyOp" @change="onBodyOpChange")
      a-option(v-for="op in bodyOps" :key="op" :value="op") {{ op }}
    a-input.filter-value(
      v-if="bodyNeedsValue"
      v-model="bodyDraft"
      size="small"
      allow-clear
      @blur="commitBody"
      @press-enter="commitBody"
      @clear="clearBody"
    )
  .filter-item(v-if="columns.service")
    span.filter-label {{ columns.service }}
    a-select.filter-op.filter-op--short(size="small" :model-value="serviceOp" @change="onServiceOpChange")
      a-option(v-for="op in serviceOps" :key="op.value" :value="op.value") {{ op.label }}
    a-input.filter-value(
      v-model="serviceDraft"
      size="small"
      allow-clear
      @focus="serviceEditing = true"
      @blur="commitService"
      @press-enter="commitService"
      @clear="clearService"
    )
  LevelFilter(v-if="columns.severity" :column="columns.severity" :label="columns.severity")
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useDrilldownContext } from '@/observability/context'
  import { DRILLDOWN_FILTER_OP_OPTIONS } from '@/observability/filters'
  import { LOGS_BODY_OPS, isLogsBodyOp, logsBodyOpNeedsValue } from '@/observability/logs/body-search'
  import type { DrilldownFilterOp } from '@/observability/types'
  import LevelFilter from './level-filter.vue'

  const ctx = useDrilldownContext()
  const { logsTab, logsBodyOp, logsBodyValue } = ctx

  const bodyOps = LOGS_BODY_OPS
  const serviceOps = DRILLDOWN_FILTER_OP_OPTIONS
  const bodyDraft = ref('')
  const serviceDraft = ref('')
  const serviceOp = ref<DrilldownFilterOp>('=')
  const serviceEditing = ref(false)

  const columns = computed(() => {
    const { logs } = ctx.fieldMap.value
    const column = (value?: string) => value?.trim() || undefined
    return {
      body: column(logs.body),
      service: column(logs.service),
      severity: column(logs.severity),
    }
  })

  const bodyNeedsValue = computed(() => logsBodyOpNeedsValue(logsBodyOp.value))

  const visible = computed(
    () =>
      Boolean(columns.value.service || columns.value.severity) ||
      (logsTab.value === 'logs' && Boolean(columns.value.body))
  )

  function isFilterOp(value: unknown): value is DrilldownFilterOp {
    return serviceOps.some((op) => op.value === value)
  }

  function syncServiceFromFilters() {
    const column = columns.value.service
    if (!column || serviceEditing.value) {
      return
    }
    const match = ctx.filters.value.find((filter) => filter.key === column)
    serviceDraft.value = match?.value ?? ''
    serviceOp.value = match && isFilterOp(match.op) ? match.op : serviceOp.value
  }

  watch(() => [columns.value.service, ctx.filters.value] as const, syncServiceFromFilters, {
    immediate: true,
    deep: true,
  })

  watch(
    logsBodyValue,
    (value) => {
      bodyDraft.value = value
    },
    { immediate: true }
  )

  function commitBody() {
    logsBodyValue.value = bodyDraft.value.trim()
    bodyDraft.value = logsBodyValue.value
  }

  function clearBody() {
    bodyDraft.value = ''
    commitBody()
  }

  function onBodyOpChange(value: string | number | Record<string, unknown> | undefined) {
    if (!isLogsBodyOp(value)) {
      return
    }
    logsBodyOp.value = value
    if (!logsBodyOpNeedsValue(logsBodyOp.value)) {
      logsBodyValue.value = ''
    }
  }

  function ensureServiceMapped(column: string) {
    const { logs } = ctx.fieldMap.value
    if (logs.service === column && logs[column] === column) {
      return
    }
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      logs: { ...logs, service: column, [column]: column },
    }
  }

  function commitService() {
    serviceEditing.value = false
    const column = columns.value.service
    if (!column) {
      return
    }
    const value = serviceDraft.value.trim()
    serviceDraft.value = value
    let next = ctx.filters.value.filter((filter) => filter.key !== column)
    if (value) {
      ensureServiceMapped(column)
      next = [...next, { key: column, op: serviceOp.value, value }]
    }
    ctx.setFilters(next)
  }

  function clearService() {
    serviceDraft.value = ''
    commitService()
  }

  function onServiceOpChange(value: string | number | Record<string, unknown> | undefined) {
    if (!isFilterOp(value)) {
      return
    }
    serviceOp.value = value
    if (serviceDraft.value.trim()) {
      commitService()
    }
  }
</script>

<style scoped lang="less">
  .logs-detail-filters {
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gpt-gap-md);
    min-height: 0;
    padding: var(--gpt-gap-sm) var(--gpt-page-padding-x);
    border-bottom: 1px solid var(--color-border-2);
    background: transparent;
  }

  .filter-item {
    display: inline-flex;
    flex: 0 1 auto;
    align-items: center;
    gap: var(--gpt-gap-md);
    min-width: 0;
  }

  .filter-label {
    flex-shrink: 0;
    font-size: var(--gpt-font-base);
    font-weight: var(--gpt-font-weight-control);
    color: var(--gpt-text-primary, var(--color-text-1));
    line-height: 1;
    white-space: nowrap;
  }

  .filter-op,
  .filter-value {
    :deep(.arco-select-view),
    :deep(.arco-input-wrapper) {
      box-sizing: border-box;
      height: var(--gpt-control-height-sm);
      min-height: var(--gpt-control-height-sm);
    }
  }

  .filter-op {
    width: 136px;
    min-width: 136px;
  }

  .filter-op--short {
    width: 88px;
    min-width: 88px;
  }

  .filter-value {
    width: 180px;
    min-width: 140px;
  }
</style>
