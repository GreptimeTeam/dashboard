<template lang="pug">
.level-filter(v-if="severityColumn")
  span.level-filter-label {{ t('drilldown.logs.levelFilter') }}
  a-select.level-filter-select(
    v-model="selectedLevels"
    multiple
    allow-clear
    allow-search
    :loading="loading"
    :max-tag-count="2"
    :placeholder="t('drilldown.logs.levelAll')"
  )
    a-option(
      v-for="row in levels"
      :key="row.value"
      :value="row.value"
      :title="countTitle(row)"
    ) {{ row.value }}
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { fetchSeverityLevels, type LabelValueRow } from '@/observability/adapters/logs'
  import { addFilter, splitFilterOrValues } from '@/observability/filters'

  const { t } = useI18n()
  const ctx = useDrilldownContext()

  const loading = ref(false)
  const levels = ref<LabelValueRow[]>([])

  /** Physical severity column from settings (e.g. `level`); also the shared filter chip key. */
  const severityColumn = computed(() => ctx.fieldMap.value.logs.severity || undefined)

  function countTitle(row: LabelValueRow) {
    return t('drilldown.logs.valueCount', { count: row.count })
  }

  function ensureSeverityMapped() {
    const col = severityColumn.value
    if (!col) return
    if (ctx.fieldMap.value.logs.severity === col) return
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      logs: { ...ctx.fieldMap.value.logs, severity: col },
    }
  }

  const selectedLevels = computed({
    get(): string[] {
      const col = severityColumn.value
      if (!col) return []
      const severityFilter = ctx.filters.value.find(
        (filter) => filter.key === col && (filter.op === '=' || filter.op === '=~')
      )
      if (!severityFilter) {
        return []
      }
      return splitFilterOrValues(severityFilter)
    },
    set(values: string[] | undefined) {
      const col = severityColumn.value
      if (!col) return
      ensureSeverityMapped()
      const nextValues = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
      let next = ctx.filters.value.filter((filter) => filter.key !== col)
      nextValues.forEach((value) => {
        next = addFilter(next, { key: col, op: '=', value })
      })
      ctx.setFilters(next)
    },
  })

  async function loadLevels() {
    if (!severityColumn.value || !ctx.logsTable.value) {
      levels.value = []
      return
    }
    loading.value = true
    try {
      levels.value = (await fetchSeverityLevels(ctx)) ?? []
    } finally {
      loading.value = false
    }
  }

  onMounted(loadLevels)

  watch(
    () =>
      [
        severityColumn.value,
        ctx.logsTable.value,
        ctx.refreshKey.value,
        ctx.time.value,
        ctx.rangeTime.value[0],
        ctx.rangeTime.value[1],
        // Reload when non-severity filters change so counts stay useful.
        ctx.filters.value
          .filter((filter) => filter.key !== severityColumn.value)
          .map((filter) => `${filter.key}${filter.op}${filter.value}`)
          .join('\0'),
      ] as const,
    loadLevels
  )
</script>

<style scoped lang="less">
  .level-filter {
    display: inline-flex;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--gpt-gap-md);
    min-width: 0;
  }

  .level-filter-label {
    flex-shrink: 0;
    font-size: var(--gpt-font-base);
    font-weight: var(--gpt-font-weight-control);
    color: var(--gpt-text-primary, var(--color-text-1));
    line-height: 1;
    white-space: nowrap;
  }

  // Match Fields combobox: medium control height + same width floor.
  .level-filter-select {
    width: 200px;
    min-width: 200px;

    :deep(.arco-select-view-single),
    :deep(.arco-select-view-multiple) {
      box-sizing: border-box;
      min-height: var(--gpt-control-height-md);
      padding-top: 0;
      padding-bottom: 0;
    }

    :deep(.arco-select-view-multiple) {
      padding-left: var(--gpt-gap-md);
      padding-right: var(--gpt-gap-md);
    }

    :deep(.arco-select-view-input) {
      font-size: var(--gpt-font-base);
    }
  }
</style>
