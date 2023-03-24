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
  function clear(type: string) {
    logs.value = logs.value.filter((log) => log.type !== type)
  }

  return {
    logs,
    push,
    clear,
  }
})
export default useLogStore
