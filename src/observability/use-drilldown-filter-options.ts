import { ref, watch } from 'vue'
import {
  canSuggestFilterValues,
  fetchFilterKeyOptions,
  fetchFilterValueOptions,
  fetchLogsContainsKeyOptions,
  fetchLogsFilterKeyOptions,
  fetchSqlFieldKeys,
  fetchSqlLabelKeys,
} from './adapters/filter-options'
import type { DrilldownContext } from './context'
import { loadDrilldownSettings } from './drilldown-settings'
import { filterAppliesToSignal } from './filters'
import { parseJsonFieldChipKey } from './logs/json-field-keys'
import { isLogsContainsFilterKey } from './logs/field-map'

export type FilterSuggestMode = 'default' | 'fields'

export default function useDrilldownFilterOptions(
  ctx: DrilldownContext,
  options?: { suggestMode?: FilterSuggestMode }
) {
  const suggestMode = options?.suggestMode ?? 'default'
  const keysLoading = ref(false)
  const valuesLoading = ref(false)
  const keyOptions = ref<string[]>([])
  /** Cached suggest keys for the active SQL signal. Empty on metrics. */
  const labelKeys = ref<string[]>([])
  const containsKeys = ref<string[]>([])
  const valueOptionsByKey = ref<Record<string, string[]>>({})

  const clearSuggestCache = () => {
    keyOptions.value = []
    labelKeys.value = []
    containsKeys.value = []
    valueOptionsByKey.value = {}
  }

  const loadSuggestKeys = async (search = '') => {
    if (suggestMode === 'fields') {
      const keys = await fetchSqlFieldKeys(ctx, search)
      // Level filter owns severity — keep it out of the field combobox.
      const severityCol = ctx.fieldMap.value.logs.severity
      return keys.filter((key) => key !== 'severity' && key !== severityCol)
    }
    return fetchFilterKeyOptions(ctx, search)
  }

  const refreshLabelKeys = async () => {
    const signal = ctx.signal.value
    if (suggestMode === 'fields') {
      labelKeys.value = signal === 'logs' ? await loadSuggestKeys('') : []
      containsKeys.value = signal === 'logs' ? await fetchLogsContainsKeyOptions(ctx) : []
      return
    }
    if (signal === 'metrics') {
      labelKeys.value = []
      containsKeys.value = []
      return
    }
    if (signal === 'logs') {
      labelKeys.value = await fetchLogsFilterKeyOptions(ctx, '')
      containsKeys.value = await fetchLogsContainsKeyOptions(ctx)
      return
    }
    containsKeys.value = []
    labelKeys.value = await fetchSqlLabelKeys(ctx, 'traces', '')
  }

  const loadKeys = async (search = '') => {
    keysLoading.value = true
    try {
      keyOptions.value = await loadSuggestKeys(search)
    } finally {
      keysLoading.value = false
    }
  }

  const fieldMapForActiveSql = () => {
    return ctx.signal.value === 'traces' ? ctx.fieldMap.value.traces : ctx.fieldMap.value.logs
  }

  /** True when combobox can offer value DISTINCT. */
  const isSqlFieldKey = (fieldKey: string): boolean => {
    const trimmed = fieldKey.trim()
    if (!trimmed) {
      return false
    }
    if (suggestMode === 'fields') {
      return canSuggestFilterValues(trimmed, fieldMapForActiveSql(), labelKeys.value, containsKeys.value)
    }
    if (ctx.signal.value === 'metrics') {
      return false
    }
    return canSuggestFilterValues(trimmed, fieldMapForActiveSql(), labelKeys.value, containsKeys.value)
  }

  const loadValues = async (fieldKey: string, search = '') => {
    const trimmedKey = fieldKey.trim()
    if (!trimmedKey || !isSqlFieldKey(trimmedKey)) {
      valueOptionsByKey.value = { ...valueOptionsByKey.value, [trimmedKey]: [] }
      return
    }

    valuesLoading.value = true
    try {
      const { values } = await fetchFilterValueOptions(ctx, trimmedKey, {
        search,
        labelKeys: labelKeys.value,
      })
      valueOptionsByKey.value = { ...valueOptionsByKey.value, [trimmedKey]: values }
    } finally {
      valuesLoading.value = false
    }
  }

  const getValueOptions = (fieldKey: string): string[] => {
    return valueOptionsByKey.value[fieldKey.trim()] ?? []
  }

  /**
   * Whether a committed chip belongs in this combobox.
   * Logs: every filter key except severity (Level select owns that). Level never.
   */
  const isVisibleFilterKey = (key: string): boolean => {
    const trimmed = key.trim()
    if (!trimmed) {
      return false
    }

    if (ctx.signal.value === 'logs') {
      const fieldMap = ctx.fieldMap.value.logs
      const severityCol = fieldMap.severity
      if (trimmed === 'severity' || (severityCol && trimmed === severityCol)) {
        return false
      }
      // JSON attribute chips (e.g. `resource_attributes.service.name`) are valid filters
      // even though they are not physical columns — keep them visible.
      if (parseJsonFieldChipKey(trimmed)) {
        return true
      }

      if (suggestMode === 'fields') {
        // Only field-discovered keys; wait until suggest keys are loaded.
        return labelKeys.value.includes(trimmed)
      }

      // Topbar: suggested keys, plus the keys that own a dedicated entry point (service
      // aliases, body role). Those are no longer offered as suggestions, but a filter carried
      // in a URL must stay visible instead of silently filtering without any pill.
      if (trimmed === 'service' || trimmed === 'primaryGroupBy' || trimmed === fieldMap.body) {
        return true
      }
      if (labelKeys.value.includes(trimmed)) {
        return true
      }
      const mapped = fieldMap[trimmed]
      return Boolean(mapped && labelKeys.value.includes(mapped))
    }

    if (parseJsonFieldChipKey(trimmed)) {
      return true
    }
    if (suggestMode !== 'fields') {
      return true
    }
    return labelKeys.value.includes(trimmed)
  }

  watch(
    () => ctx.signal.value,
    async () => {
      clearSuggestCache()
      await refreshLabelKeys()
      await loadKeys()
    }
  )

  /**
   * Whether a committed filter applies to the current signal's bound table. Filters are
   * shared, so one carried over from metrics may name a column this table lacks; it is then
   * hidden from this signal's bar (and its queries) but stays in the shared state, so
   * switching back to a signal that supports it brings it back.
   */
  const isFilterApplicable = (key: string): boolean =>
    filterAppliesToSignal({ key, op: '=', value: '' }, ctx.signal.value, {
      fieldMap: fieldMapForActiveSql(),
      columns: ctx.signalColumns.value[ctx.signal.value],
    })

  watch(
    () =>
      [
        ctx.logsTable.value,
        ctx.tracesTable.value,
        ctx.fieldMap.value.logs,
        ctx.fieldMap.value.traces,
        loadDrilldownSettings().logs.labelInclude?.join('\0'),
        loadDrilldownSettings().logs.labelExclude?.join('\0'),
        loadDrilldownSettings().logs.fieldInclude?.join('\0'),
        loadDrilldownSettings().logs.fieldExclude?.join('\0'),
      ] as const,
    async () => {
      if (suggestMode !== 'fields' && ctx.signal.value === 'metrics') {
        return
      }
      await refreshLabelKeys()
      valueOptionsByKey.value = {}
    },
    { deep: true, immediate: true }
  )

  return {
    keysLoading,
    valuesLoading,
    keyOptions,
    labelKeys,
    containsKeys,
    isContainsFilterKey: (fieldKey: string) =>
      isLogsContainsFilterKey(fieldKey, fieldMapForActiveSql(), containsKeys.value),
    /** @deprecated alias — prefer checking labelKeys / isSqlFieldKey */
    sqlFieldKeys: labelKeys,
    isSqlFieldKey,
    isVisibleFilterKey,
    isFilterApplicable,
    loadKeys,
    loadValues,
    getValueOptions,
    refreshLabelKeys,
    refreshSqlFieldKeys: refreshLabelKeys,
  }
}
