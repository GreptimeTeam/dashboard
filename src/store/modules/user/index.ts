import { defineStore } from 'pinia'
import type { Ref } from 'vue'

const useUserStore = defineStore('user', () => {
  const role: Ref<string> = ref('dev')

  function setRole(r: string) {
    role.value = r
  }

  return {
    role,
    setRole,
  }
})

export default useUserStore
