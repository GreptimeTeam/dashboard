import { ref, toValue, type MaybeRefOrGetter } from 'vue'
import { useDrilldownContext } from './context'
import { listSignalTables } from './semantics'
import type { DrilldownSignal } from './types'

export default function useSignalTableOptions(
  signal: Extract<DrilldownSignal, 'logs' | 'traces'>,
  enabled: MaybeRefOrGetter<boolean>
) {
  const ctx = useDrilldownContext()
  const tableOptions = ref<string[]>([])
  const loadingTables = ref(false)

  const loadTables = async () => {
    if (!toValue(enabled)) {
      return
    }

    loadingTables.value = true
    try {
      const current = signal === 'logs' ? ctx.logsTable.value : ctx.tracesTable.value
      tableOptions.value = await listSignalTables(signal, {
        include: current ? [current] : [],
        database: ctx.databaseFor(signal),
      })
    } finally {
      loadingTables.value = false
    }
  }

  return {
    tableOptions,
    loadingTables,
    loadTables,
  }
}
