import type { DrilldownContext } from '../context'
import { loadDrilldownSettings } from '../drilldown-settings'

/**
 * Logs roles (`time` / `body` / `severity` / `traceId` / …) for the current table.
 *
 * Roles live in two places: the saved settings (localStorage, what the user configured) and
 * the runtime map `ctx.fieldMap.logs` (built asynchronously from the bound table's schema,
 * which only keeps a role when its column exists there). Consumers used to read the runtime
 * map alone, so a role silently disappeared whenever that map was not built yet, could not be
 * built, or was built against a table that no longer had the saved column — even though the
 * settings had it. Read roles through here: settings fill the gaps, the runtime map wins when
 * it has an answer.
 *
 * Callers that turn roles into SQL must still validate the column against the real schema
 * (`selectLogColumns` / `schemaHasColumn`), which they already do.
 */
export default function resolveLogsRoles(ctx: DrilldownContext): Record<string, string> {
  const roles: Record<string, string> = {}
  const saved = loadDrilldownSettings().logs.fieldMap
  if (saved) {
    Object.entries(saved).forEach(([role, column]) => {
      if (typeof column === 'string' && column.trim()) {
        roles[role] = column.trim()
      }
    })
  }
  return { ...roles, ...ctx.fieldMap.value.logs }
}
