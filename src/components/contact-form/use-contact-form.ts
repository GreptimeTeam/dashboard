import { ref } from 'vue'

const visible = ref(false)

/** Shared open state for Support menu / command palette / deep links. */
export default function useContactForm() {
  function show() {
    visible.value = true
  }

  function close() {
    visible.value = false
  }

  return {
    visible,
    show,
    close,
  }
}
