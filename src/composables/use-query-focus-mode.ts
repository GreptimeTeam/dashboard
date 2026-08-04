import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store'

/** Query 页聚焦模式，仅控制布局显隐，不写入 uiConfig、不卸载子组件 */
export const queryFocusMode = ref(false)

export function useQueryFocusMode() {
  return queryFocusMode
}

/** 主导航是否处于收起态 */
export function useNavbarLayoutCollapsed() {
  const { menuCollapse } = storeToRefs(useAppStore())
  return computed(() => menuCollapse.value)
}
