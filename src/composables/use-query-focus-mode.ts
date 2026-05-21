import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store'

/** Query 页聚焦模式，仅控制布局显隐，不写入 uiConfig、不卸载子组件 */
export const queryFocusMode = ref(false)

/** 聚焦模式下用户是否展开左侧主导航（默认收起，可由导航栏按钮切换） */
export const queryFocusNavExpanded = ref(false)

watch(queryFocusMode, (active) => {
  if (!active) queryFocusNavExpanded.value = false
})

export function useQueryFocusMode() {
  return queryFocusMode
}

/** 主导航是否处于收起态（聚焦模式用临时状态，不影响 uiConfig.menuCollapse） */
export function useNavbarLayoutCollapsed() {
  const { menuCollapse } = storeToRefs(useAppStore())

  return computed(() => {
    if (queryFocusMode.value) {
      return !queryFocusNavExpanded.value
    }
    return menuCollapse.value
  })
}
