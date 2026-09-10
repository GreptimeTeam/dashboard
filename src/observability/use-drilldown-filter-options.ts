import { ref, watch } from 'vue'
import {
  canSuggestFilterValues,
  fetchFilterKeyOptions,
  fetchFilterValueOptions,
  fetchSqlLabelKeys,
} from './adapters/filter-options'
import type { DrilldownContext } from './context'
import { loadDrilldownSettings } from './drilldown-settings'

export default function useDrilldownFilterOptions(ctx: DrilldownContext) {
  const keysLoading = ref(false)
  const valuesLoading = ref(false)
  const keyOptions = ref<string[]>([])
  /** Cached label keys for the active SQL signal (logs/traces). Empty on metrics. */
  const labelKeys = ref<string[]>([])
  const valueOptionsByKey = ref<Record<string, string[]>>({})

  const clearSuggestCache = () => {
    keyOptions.value = []
    labelKeys.value = []
    valueOptionsByKey.value = {}
  }

  const refreshLabelKeys = async () => {
    const signal = ctx.signal.value
    if (signal === 'metrics') {
      labelKeys.value = []
      return
    }
    const sqlSignal = signal === 'traces' ? 'traces' : 'logs'
    labelKeys.value = await fetchSqlLabelKeys(ctx, sqlSignal, '')
  }

  const loadKeys = async (search = '') => {
    keysLoading.value = true
    try {
      keyOptions.value = await fetchFilterKeyOptions(ctx, search)
    } finally {
      keysLoading.value = false
    }
  }

  const fieldMapForActiveSql = () => {
    return ctx.signal.value === 'traces' ? ctx.fieldMap.value.traces : ctx.fieldMap.value.logs
  }

  /** True when top-bar can offer value DISTINCT (logs/traces label keys only). */
  const isSqlFieldKey = (fieldKey: string): boolean => {
    const trimmed = fieldKey.trim()
    if (!trimmed || ctx.signal.value === 'metrics') {
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
        // Re-read settings when table/map changes (include/exclude live in localStorage).
        loadDrilldownSettings().logs.labelInclude?.join('\0'),
        loadDrilldownSettings().logs.labelExclude?.join('\0'),
      ] as const,
    async () => {
      if (ctx.signal.value === 'metrics') {
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
    loadKeys,
    loadValues,
    getValueOptions,
    refreshLabelKeys,
    refreshSqlFieldKeys: refreshLabelKeys,
  }
}
