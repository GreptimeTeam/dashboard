import { defineStore } from 'pinia'
import type { Ref } from 'vue'
import { Log } from './types'

const useLogStore = defineStore('log', () => {
  const logs: Ref<Log[]> = ref([])

  function push(log: Log, type: string) {
    logs.value.push({
      ...log,
      type,
    })
  }
  function clear(type: string | string[]) {
    const types = Array.isArray(type) ? type : [type]
    if (!type) {
      logs.value = []
    }
    logs.value = logs.value.filter((log) => !types.includes(log.type))
    console.log(`types, logs.value:`, types, logs.value)
  }

  return {
    logs,
    push,
    clear,
  }
})
export default useLogStore
