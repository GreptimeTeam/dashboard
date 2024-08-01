import { defineStore } from 'pinia'
import { VNode } from 'vue'

export interface StatusContentSimple {
  text?: string
  icon?: Component | string
  onClick?: (item: any, evt: PointerEvent) => void
}

export type StatusContentType = StatusContentSimple | VNode

export type StatusItem = {
  id: number
  pos?: 'left' | 'right'
  timeout?: number
  content: StatusContentType
}
type StatusConfig = {
  pos?: 'left' | 'right'
  timeout?: number
}
export const useStatusBarStore = defineStore('statusBarStore', () => {
  let idNum = 0
  const status = ref<StatusItem[]>([])
  const statusLeft = computed(() => {
    return status.value.filter((item) => item.pos === 'left').map((item) => item.content)
  })

  const statusRight = computed(() => {
    return status.value.filter((item) => item.pos !== 'left').map((item) => item.content)
  })

  function remove(id: number) {
    for (let index = 0; index < status.value.length; index += 1) {
      if (id === status.value[index].id) {
        status.value.splice(index, 1)
        break
      }
    }
  }

  function add(item: StatusContentType, conf = {} as StatusConfig) {
    idNum += 1
    const id = idNum
    status.value.push({ content: item, ...conf, id })
    if (conf.timeout) {
      setTimeout(() => {
        remove(id)
      }, conf.timeout)
    }
    return id
  }

  function update(id: number, item: StatusContentType, conf = {} as StatusConfig) {
    for (let index = 0; index < status.value.length; index += 1) {
      if (id === status.value[index].id) {
        status.value[index] = {
          id,
          content: item,
          ...conf,
        }
        break
      }
    }
  }

  return {
    status,
    add,
    remove,
    update,
    statusLeft,
    statusRight,
  }
})
