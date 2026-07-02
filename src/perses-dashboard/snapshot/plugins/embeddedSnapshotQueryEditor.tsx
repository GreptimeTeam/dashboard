import * as React from 'react'
import { Typography } from '@mui/material'
import { PluginSpecEditor } from '@perses-dev/plugin-system'
import type { EmbeddedSnapshotQuerySpec } from '../types'

type SnapshotQueryEditorProps = {
  value: EmbeddedSnapshotQuerySpec
  onChange: (value: EmbeddedSnapshotQuerySpec) => void
  isReadonly?: boolean
}

export default function createEmbeddedSnapshotQueryEditor(
  queryType: 'TimeSeriesQuery' | 'LogQuery' | 'TraceQuery'
): (props: SnapshotQueryEditorProps) => JSX.Element {
  return function EmbeddedSnapshotQueryEditor(props: SnapshotQueryEditorProps) {
    const { value, isReadonly } = props
    const { originalPlugin } = value
    if (!originalPlugin?.kind) {
      return (
        <Typography variant="body2" color="text.secondary">
          Original query is not available in this snapshot.
        </Typography>
      )
    }

    return (
      <PluginSpecEditor
        value={originalPlugin.spec}
        pluginSelection={{ kind: originalPlugin.kind, type: queryType }}
        onChange={() => undefined}
        isReadonly={isReadonly ?? true}
      />
    )
  }
}
