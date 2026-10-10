import { computed, ref, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'

const DEFAULT_BATCH_SIZE = 48

/**
 * Progressively reveal list items as a bottom sentinel enters the scroll root.
 * Resets when `total` or identity of the item set changes (caller bumps `resetKey`).
 */
export default function useScrollBatchReveal(
  total: Ref<number>,
  scrollRoot: MaybeRefOrGetter<HTMLElement | null | undefined>,
  options?: { batchSize?: number; resetKey?: Ref<unknown> }
) {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE
  const visibleCount = ref(batchSize)
  const sentinelRef = ref<HTMLElement | null>(null)

  const reset = () => {
    visibleCount.value = Math.min(batchSize, Math.max(total.value, 0))
  }

  watch(
    () => [total.value, options?.resetKey?.value] as const,
    () => {
      reset()
    },
    { immediate: true }
  )

  useIntersectionObserver(
    sentinelRef,
    ([entry]) => {
      if (!entry?.isIntersecting) {
        return
      }
      if (visibleCount.value >= total.value) {
        return
      }
      visibleCount.value = Math.min(visibleCount.value + batchSize, total.value)
    },
    {
      root: scrollRoot,
      rootMargin: '200px',
    }
  )

  const hasMore = computed(() => visibleCount.value < total.value)

  return {
    visibleCount,
    sentinelRef,
    hasMore,
    batchSize,
  }
}

export { DEFAULT_BATCH_SIZE }
