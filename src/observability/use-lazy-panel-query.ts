import { ref, type Ref } from 'vue'
import { useIntersectionObserver } from '@vueuse/core'

export default function useLazyPanelQuery(root: Ref<HTMLElement | null | undefined>) {
  const targetRef = ref<HTMLElement | null>(null)
  const isVisible = ref(false)
  const hasBeenVisible = ref(false)

  useIntersectionObserver(
    targetRef,
    ([entry]) => {
      isVisible.value = entry?.isIntersecting ?? false
      if (entry?.isIntersecting) {
        hasBeenVisible.value = true
      }
    },
    {
      root,
      rootMargin: '200px',
    }
  )

  return {
    targetRef,
    isVisible,
    hasBeenVisible,
  }
}
