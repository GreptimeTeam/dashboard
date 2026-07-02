import type {
  DashboardResource,
  EphemeralDashboardResource,
  TextVariableDefinition,
  VariableDefinition,
} from '@perses-dev/core'
import { getSnapshotEmbed } from './isSnapshotDashboard'

type DashboardLike = DashboardResource | EphemeralDashboardResource

function formatSnapshotVariableValue(value: string | string[]): string {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== '').join(', ')
  }
  return String(value)
}

function freezeVariable(
  def: VariableDefinition,
  savedValue: string | string[] | undefined
): TextVariableDefinition | undefined {
  const { name, display: specDisplay } = def.spec
  const display = specDisplay ?? { name }

  let value: string | string[] | undefined = savedValue
  if (value === undefined) {
    if (def.kind === 'TextVariable') {
      const { value: textValue } = def.spec
      value = textValue
    } else if (def.kind === 'ListVariable' && def.spec.defaultValue != null) {
      const { defaultValue } = def.spec
      value = defaultValue as string | string[]
    }
  }

  if (value === undefined || value === null || value === '') {
    return undefined
  }

  const textValue = formatSnapshotVariableValue(value)
  if (!textValue) {
    return undefined
  }

  // Snapshot filters are read-only labels. TextVariable avoids ListVariable option
  // hydration that resets values when StaticListVariable options are still loading.
  return {
    kind: 'TextVariable',
    spec: {
      name,
      display,
      value: textValue,
      constant: true,
    },
  }
}

/**
 * Grafana snapshots strip live query/variable plugins. For view, replace dynamic
 * variable plugins (e.g. PrometheusLabelValuesVariable) with static definitions
 * so opening a snapshot does not hit Prometheus/GreptimeDB.
 */
export function buildFrozenVariables(
  originalVars: VariableDefinition[],
  saved: Record<string, string | string[]>
): VariableDefinition[] {
  const frozen = originalVars
    .map((def) => freezeVariable(def, saved[def.spec.name]))
    .filter((def): def is TextVariableDefinition => def !== undefined)

  const knownNames = new Set(originalVars.map((def) => def.spec.name))
  Object.entries(saved).forEach(([name, value]) => {
    if (knownNames.has(name)) return
    const synthetic = freezeVariable(
      {
        kind: 'TextVariable',
        spec: { name, value: '' },
      },
      value
    )
    if (synthetic) {
      frozen.push(synthetic)
    }
  })

  return frozen
}

export function prepareSnapshotViewDashboard(dashboard: DashboardResource): DashboardResource
export function prepareSnapshotViewDashboard(dashboard: EphemeralDashboardResource): EphemeralDashboardResource
export function prepareSnapshotViewDashboard(dashboard: DashboardLike): DashboardLike {
  const snapshot = getSnapshotEmbed(dashboard)
  if (!snapshot) {
    return dashboard
  }

  const prepared = structuredClone(dashboard) as DashboardLike
  const originalVars = prepared.spec.variables ?? []
  const saved = snapshot.variables ?? {}

  prepared.spec.variables = buildFrozenVariables(originalVars, saved)
  prepared.spec.refreshInterval = '0s'
  // Avoid Perses defaulting to a relative range when URL params are still settling.
  delete prepared.spec.duration

  return prepared
}
