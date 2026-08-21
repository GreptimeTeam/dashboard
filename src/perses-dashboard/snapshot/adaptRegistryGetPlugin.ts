/**
 * Perses 0.53: getPlugin(kind, name)
 * Perses 0.54+: getPlugin({ kind, name })
 */
export type PluginLookupArgs = {
  kind: 'TimeSeriesQuery' | 'LogQuery' | 'TraceQuery' | 'Datasource'
  name: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RegistryGetPlugin = (...args: any[]) => Promise<any>

export function adaptRegistryGetPlugin(registryGetPlugin: RegistryGetPlugin) {
  return async (args: PluginLookupArgs) => {
    // useCallback preserves formal arity: 2 for (kind, name), 1 for (compoundKey)
    if (registryGetPlugin.length >= 2) {
      return registryGetPlugin(args.kind, args.name)
    }
    return registryGetPlugin(args)
  }
}
