import { defineStore } from 'pinia'
import type { Ref } from 'vue'

const useUserStore = defineStore('user', () => {
  const role: Ref<string> = ref('admin')
  const lang: Ref<string> = ref('en-US')
  const dataStatusMap = ref<{ [key: string]: boolean }>({
    tables: false,
    scripts: false,
  })
  const dataNames = ['tables', 'scripts']

  function setRole(r: string) {
    role.value = r
  }
  function setLang(r: string) {
    lang.value = r
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
    lang,
    dataStatusMap,
    setRole,
    setLang,
    updateDataStatus,
    resetDataStatus,
  }
})

export default useUserStore
