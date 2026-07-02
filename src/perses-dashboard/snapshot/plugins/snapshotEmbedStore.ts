import type { EmbeddedSnapshotQuerySpec, SnapshotEmbed } from '../types'
import { reviveNormalizedQueryData } from '../reviveSnapshotPanelData'

let activeSnapshotEmbed: SnapshotEmbed | undefined

export function reviveSnapshotEmbed(snapshot: SnapshotEmbed): SnapshotEmbed {
  const panelData: SnapshotEmbed['panelData'] = {}

  Object.entries(snapshot.panelData ?? {}).forEach(([panelId, results]) => {
    panelData[panelId] = results.map((entry) => {
      if (entry.skipped || !entry.normalized) {
        return entry
      }

      const normalized = reviveNormalizedQueryData(entry.normalized, entry.queryKind)
      if (!normalized) {
        return entry
      }

      return {
        ...entry,
        normalized,
      }
    })
  })

  return {
    ...snapshot,
    panelData,
  }
}

export function setActiveSnapshotEmbed(snapshot: SnapshotEmbed | undefined) {
  activeSnapshotEmbed = snapshot ? reviveSnapshotEmbed(snapshot) : undefined
}

export function getActiveSnapshotEmbed(): SnapshotEmbed | undefined {
  return activeSnapshotEmbed
}

export function getSnapshotPanelData(spec: EmbeddedSnapshotQuerySpec): unknown {
  const snapshot = getActiveSnapshotEmbed()
  if (!snapshot) return undefined

  const entry = snapshot.panelData[spec.panelId]?.[spec.queryIndex]
  if (!entry || entry.skipped) {
    return undefined
  }

  return reviveNormalizedQueryData(entry.normalized, entry.queryKind)
}
