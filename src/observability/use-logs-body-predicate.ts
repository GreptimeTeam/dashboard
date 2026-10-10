import { computed } from 'vue'
import { useDrilldownContext } from './context'
import { logsBodyPredicate } from './logs/body-search'

/** Logs-tab body predicate. Empty when the body column is unset or the value is blank. */
export default function useLogsBodyPredicate() {
  const ctx = useDrilldownContext()
  return computed(() => {
    const column = ctx.semantics.logs.fieldMap.value.body?.trim()
    if (!column) {
      return ''
    }
    return logsBodyPredicate(column, ctx.ui.logsBodyOp.value, ctx.ui.logsBodyValue.value) ?? ''
  })
}
