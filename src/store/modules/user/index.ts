import { defineStore } from 'pinia'
import type { Ref } from 'vue'

const useUserStore = defineStore('user', () => {
  const role: Ref<string> = ref('dev')
  const dataStatusMap = ref<{ [key: string]: boolean }>({
    tables: false,
    scripts: false,
  })
  const dataNames = ['tables', 'scripts']

  function setRole(r: string) {
    role.value = r
  }

  const updateDataStatus = (name: string, status: boolean) => {
    dataStatusMap.value[name] = status
  }

  const resetDataStatus = () => {
    dataNames.forEach((name: string) => {
      updateDataStatus(name, false)
    })
  }

  return {
    role,
    dataStatusMap,
    setRole,
    updateDataStatus,
    resetDataStatus,
  }
})

export default useUserStore
