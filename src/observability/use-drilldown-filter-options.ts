import { ref, watch } from 'vue'
import {
  canSuggestFilterValues,
  fetchFilterKeyOptions,
  fetchFilterValueOptions,
  fetchLogsFilterKeyOptions,
  fetchSqlFieldKeys,
  fetchSqlLabelKeys,
} from './adapters/filter-options'
import type { DrilldownContext } from './context'
import { loadDrilldownSettings } from './drilldown-settings'

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
  const valueOptionsByKey = ref<Record<string, string[]>>({})

  const clearSuggestCache = () => {
    keyOptions.value = []
    labelKeys.value = []
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
      return
    }
    if (signal === 'metrics') {
      labelKeys.value = []
      return
    }
    if (signal === 'logs') {
      labelKeys.value = await fetchLogsFilterKeyOptions(ctx, '')
      return
    }
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
      return canSuggestFilterValues(trimmed, fieldMapForActiveSql(), labelKeys.value)
    }
    if (ctx.signal.value === 'metrics') {
      return false
    }
    return canSuggestFilterValues(trimmed, fieldMapForActiveSql(), labelKeys.value)
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
   * Logs topbar (default): Labels only. Logs fields mode: Fields only. Level never.
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

      if (suggestMode === 'fields') {
        // Only field-discovered keys; wait until suggest keys are loaded.
        return labelKeys.value.includes(trimmed)
      }

      // Topbar: label chips only (service aliases + discovered labels).
      if (trimmed === 'service' || trimmed === 'primaryGroupBy') {
        return true
      }
      if (labelKeys.value.includes(trimmed)) {
        return true
      }
      const mapped = fieldMap[trimmed]
      return Boolean(mapped && labelKeys.value.includes(mapped))
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
    /** @deprecated alias — prefer checking labelKeys / isSqlFieldKey */
    sqlFieldKeys: labelKeys,
    isSqlFieldKey,
    isVisibleFilterKey,
    loadKeys,
    loadValues,
    getValueOptions,
    refreshLabelKeys,
    refreshSqlFieldKeys: refreshLabelKeys,
  }
}
