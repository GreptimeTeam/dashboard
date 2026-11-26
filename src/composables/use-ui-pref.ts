import { computed, type ComputedRef } from 'vue'
import { useAppStore } from '@/store'
import type { UiConfig } from '@/store/modules/app/types'

/**
 * Two-way binding for one uiConfig field.
 *
 * UI preferences (widths, heights, expanded states) live inside the single `uiConfig`
 * object, so they stay grouped and share one slot. `fallback` is used until the user
 * changes the value (or an old standalone key is migrated by the app store).
 */
export default function useUiPref<K extends keyof UiConfig>(
  key: K,
  fallback: NonNullable<UiConfig[K]>
): ComputedRef<NonNullable<UiConfig[K]>> {
  const store = useAppStore()
  return computed({
    get: () => (store.getUiConfigValue(key) ?? fallback) as NonNullable<UiConfig[K]>,
    set: (value) => store.setUiConfigValue(key, value),
  })
}
