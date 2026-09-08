import { ref, watch } from 'vue'
import { fetchPromLabelKeys, fetchSqlFieldKeys, fetchSqlFieldValues } from './adapters/filter-options'
import type { DrilldownContext } from './context'

function filterBySearch(keys: string[], search: string): string[] {
  const query = search.trim().toLowerCase()
  if (!query) {
    return keys
  }
  return keys.filter((key) => key.toLowerCase().includes(query))
}

export default function useDrilldownFilterOptions(ctx: DrilldownContext) {
  const keysLoading = ref(false)
  const valuesLoading = ref(false)
  const keyOptions = ref<string[]>([])
  const sqlFieldKeys = ref<string[]>([])
  const valueOptionsByKey = ref<Record<string, string[]>>({})

  const refreshSqlFieldKeys = async () => {
    if (!ctx.logsTable.value) {
      sqlFieldKeys.value = []
      return
    }
    sqlFieldKeys.value = await fetchSqlFieldKeys(ctx, '')
  }

  const loadKeys = async (search = '') => {
    keysLoading.value = true
    try {
      const promKeys = await fetchPromLabelKeys(ctx, search)
      const sqlKeys = filterBySearch(sqlFieldKeys.value, search)
      keyOptions.value = [...new Set([...promKeys, ...sqlKeys])].sort((left, right) => left.localeCompare(right))
    } finally {
      keysLoading.value = false
    }
  }

  const isSqlFieldKey = (fieldKey: string): boolean => {
    const trimmed = fieldKey.trim()
    if (!trimmed || !ctx.logsTable.value) {
      return false
    }
    return sqlFieldKeys.value.includes(trimmed)
  }

  const loadValues = async (fieldKey: string, search = '') => {
    const trimmedKey = fieldKey.trim()
    if (!trimmedKey || !isSqlFieldKey(trimmedKey)) {
      valueOptionsByKey.value = { ...valueOptionsByKey.value, [trimmedKey]: [] }
      return
    }

    valuesLoading.value = true
    try {
      const values = await fetchSqlFieldValues(ctx, trimmedKey, search)
      valueOptionsByKey.value = { ...valueOptionsByKey.value, [trimmedKey]: values }
    } finally {
      valuesLoading.value = false
    }
  }

  const getValueOptions = (fieldKey: string): string[] => {
    return valueOptionsByKey.value[fieldKey.trim()] ?? []
  }

  watch(
    () => [ctx.logsTable.value, ctx.fieldMap.value.logs] as const,
    () => {
      refreshSqlFieldKeys()
    },
    { deep: true, immediate: true }
  )

  return {
    keysLoading,
    valuesLoading,
    keyOptions,
    sqlFieldKeys,
    isSqlFieldKey,
    loadKeys,
    loadValues,
    getValueOptions,
    refreshSqlFieldKeys,
  }
}
