<template lang="pug">
.logs-detail-filters(v-if="visible")
  .filter-item(v-if="columns.body && logsTab === 'logs'")
    span.filter-label {{ columns.body }}
    a-select.filter-op(size="small" :model-value="bodyOpDraft" @change="onBodyOpChange")
      a-option(v-for="op in bodyOps" :key="op" :value="op") {{ op }}
    a-input.filter-value(
      v-if="bodyNeedsValue"
      v-model="bodyDraft"
      size="small"
      allow-clear
      @press-enter="runQuery"
      @clear="clearBody"
    )
  .filter-item(v-if="columns.service")
    span.filter-label {{ columns.service }}
    a-select.filter-op.filter-op--short(size="small" :model-value="serviceOp" @change="onServiceOpChange")
      a-option(v-for="op in serviceOps" :key="op.value" :value="op.value") {{ op.label }}
    a-select.filter-value(
      v-if="serviceUsesSuggest"
      size="small"
      allow-search
      allow-clear
      :model-value="serviceDraft"
      :loading="serviceSuggestLoading"
      @popup-visible-change="onServicePopupVisible"
      @change="onServiceSuggestChange"
    )
      a-option(
        v-for="row in serviceSuggestions"
        :key="row.value"
        :value="row.value"
        :title="suggestionTitle(row)"
      ) {{ row.value }}
    a-input.filter-value(
      v-else
      v-model="serviceDraft"
      size="small"
      allow-clear
      @focus="serviceEditing = true"
      @press-enter="runQuery"
      @clear="clearService"
    )
  LevelFilter(v-if="columns.severity" :column="columns.severity" :label="columns.severity")
  a-button.filter-query(type="primary" size="small" @click="runQuery") {{ t('drilldown.logs.runQuery') }}
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { fetchLabelValues, type LabelValueRow } from '@/observability/adapters/logs'
  import resolveLogsRoles from '@/observability/logs/resolved-roles'
  import { DRILLDOWN_FILTER_OP_OPTIONS } from '@/observability/filters'
  import { LOGS_BODY_OPS, isLogsBodyOp, logsBodyOpNeedsValue, type LogsBodyOp } from '@/observability/logs/body-search'
  import type { DrilldownFilterOp } from '@/observability/types'
  import LevelFilter from './level-filter.vue'

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const { logsTab, logsBodyOp, logsBodyValue } = ctx

  const bodyOps = LOGS_BODY_OPS
  const serviceOps = DRILLDOWN_FILTER_OP_OPTIONS
  const bodyDraft = ref('')
  const bodyOpDraft = ref<LogsBodyOp>(logsBodyOp.value)
  const serviceDraft = ref('')
  const serviceOp = ref<DrilldownFilterOp>('=')
  const serviceEditing = ref(false)
  const serviceSuggestions = ref<LabelValueRow[]>([])
  const serviceSuggestLoading = ref(false)
  const SCOPE_SUGGEST_LIMIT = 200

  const columns = computed(() => {
    // Settings fill roles the runtime map has not resolved (see resolveLogsRoles), so the row
    // renders immediately instead of appearing only after the asynchronous rebuild.
    const roles = resolveLogsRoles(ctx)
    const role = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
    return {
      body: role(roles.body),
      service: role(roles.service),
      severity: role(roles.severity),
    }
  })

  const bodyNeedsValue = computed(() => logsBodyOpNeedsValue(bodyOpDraft.value))
  const serviceUsesSuggest = computed(() => columns.value.service === 'scope_name')

  const visible = computed(
    () =>
      Boolean(columns.value.service || columns.value.severity) ||
      (logsTab.value === 'logs' && Boolean(columns.value.body))
  )

  function isFilterOp(value: unknown): value is DrilldownFilterOp {
    return serviceOps.some((op) => op.value === value)
  }

  function suggestionTitle(row: LabelValueRow) {
    return t('drilldown.logs.valueCount', { count: row.count })
  }

  async function loadServiceSuggestions() {
    const column = columns.value.service
    if (column !== 'scope_name' || !ctx.logsTable.value) {
      serviceSuggestions.value = []
      return
    }
    serviceSuggestLoading.value = true
    try {
      serviceSuggestions.value = (
        (await fetchLabelValues(ctx, column, {
          limit: SCOPE_SUGGEST_LIMIT,
          excludeFilterKey: column,
        })) ?? []
      ).filter((row) => row.value.trim())
    } finally {
      serviceSuggestLoading.value = false
    }
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

  watch(
    () => columns.value.service,
    () => {
      serviceSuggestions.value = []
    }
  )

  watch(() => [columns.value.service, ctx.filters.value] as const, syncServiceFromFilters, {
    immediate: true,
    deep: true,
  })

  watch(logsBodyOp, (op) => {
    bodyOpDraft.value = op
  })

  watch(
    logsBodyValue,
    (value) => {
      bodyDraft.value = value
    },
    { immediate: true }
  )

  function commitBody() {
    const op = bodyOpDraft.value
    logsBodyOp.value = op
    logsBodyValue.value = logsBodyOpNeedsValue(op) ? bodyDraft.value.trim() : ''
    bodyDraft.value = logsBodyValue.value
  }

  function onBodyOpChange(value: string | number | Record<string, unknown> | undefined) {
    if (!isLogsBodyOp(value)) {
      return
    }
    bodyOpDraft.value = value
    if (!logsBodyOpNeedsValue(value)) {
      bodyDraft.value = ''
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

  function runQuery() {
    commitBody()
    commitService()
    ctx.triggerRefresh()
  }

  function clearBody() {
    bodyDraft.value = ''
    runQuery()
  }

  function clearService() {
    serviceDraft.value = ''
    runQuery()
  }

  function onServicePopupVisible(popupVisible: boolean) {
    if (popupVisible) {
      loadServiceSuggestions()
    }
  }

  function onServiceSuggestChange(value: string | number | Record<string, unknown> | undefined) {
    serviceDraft.value = value == null || typeof value === 'object' ? '' : String(value)
    runQuery()
  }

  function onServiceOpChange(value: string | number | Record<string, unknown> | undefined) {
    if (!isFilterOp(value)) {
      return
    }
    serviceOp.value = value
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

  .filter-query {
    flex-shrink: 0;
    height: var(--gpt-control-height-sm);
  }
</style>
