import { computed } from 'vue'
import { useDrilldownContext } from './context'
import { logsBodyPredicate } from './logs/body-search'

/** Logs-tab body predicate. Empty when the body column is unset or the value is blank. */
export default function useLogsBodyPredicate() {
  const ctx = useDrilldownContext()
  return computed(() => {
    const column = ctx.fieldMap.value.logs.body?.trim()
    if (!column) {
      return ''
    }
    return logsBodyPredicate(column, ctx.logsBodyOp.value, ctx.logsBodyValue.value) ?? ''
  })
}
