import { defineStore } from 'pinia'
import type { Ref } from 'vue'

const useUserStore = defineStore('user', () => {
  const role: Ref<string> = ref('dev')
  const dataStatusMap = ref<{ [key: string]: boolean }>({
    tables: false,
    scripts: false,
  })

  function setRole(r: string) {
    role.value = r
  }

  const updateDataStatus = (name: string, status: boolean) => {
    dataStatusMap.value[name] = status
  }

  return {
    role,
    dataStatusMap,
    setRole,
    updateDataStatus,
  }
})

export default useUserStore
