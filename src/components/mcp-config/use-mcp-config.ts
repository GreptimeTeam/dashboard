import { ref } from 'vue'

const visible = ref(false)

/** Shared open state for Support menu / command palette. */
export default function useMcpConfig() {
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
