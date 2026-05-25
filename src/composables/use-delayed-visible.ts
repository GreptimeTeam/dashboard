import type { Ref } from 'vue'

/** Delay before showing stop affordance while a long-running action is in progress. */
export const QUERY_STOP_ICON_DELAY_MS = 6000

export function useDelayedVisible(source: Ref<boolean>, delayMs = QUERY_STOP_ICON_DELAY_MS) {
  const visible = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  watch(
    source,
    (active) => {
      clearTimer()
      if (!active) {
        visible.value = false
        return
      }
      visible.value = false
      timer = setTimeout(() => {
        if (source.value) {
          visible.value = true
        }
        timer = null
      }, delayMs)
    },
    { immediate: true }
  )

  onUnmounted(clearTimer)

  return visible
}
