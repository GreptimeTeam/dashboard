import { computed, type Ref } from 'vue'

/**
 * Bind Arco `a-tabs` v-model to a Drilldown Context tab ref that URL sync watches.
 * Guards unknown keys so tab panes cannot write invalid URL/state.
 */
export default function useDrilldownPanelTab<T extends string>(options: {
  tab: Ref<T>
  setTab: (tab: T) => void
  isTab: (value: unknown) => value is T
}) {
  return computed({
    get: () => options.tab.value,
    set: (key: string | number) => {
      if (options.isTab(key)) {
        options.setTab(key)
      }
    },
  })
}
