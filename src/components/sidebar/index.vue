<template lang="pug">
a-layout.navbar
  a-card(:bordered="false")
    template(#title)
      | {{ title }}
    .menu
      a-menu(mode="vertical" :selected-keys="[submenuSelectedKey]")
        a-menu-item(
          v-for="(item, index) in menu"
          :key="item.path"
          @click.meta="menuClickWithMeta(item.name)"
          @click.ctrl="menuClickWithMeta(item.name)"
          @click.exact="menuClick(item.name)"
        )
          span {{ $t(item.meta.locale) }}
          template(#icon)
            svg.icon-18
              use(:href="`#${item.meta.icon}`")
</template>

<script lang="ts" setup name="SideBar">
  import greptimeAILogo from '@/assets/images/logo-greptime-ai.png'
  import { useAppStore } from '@/store'
  import { listenerRouteChange } from '@/utils/route-listener'
  import useMenuTree from '@/components/menu/use-menu-tree'
  import { Button, Tooltip, Popover } from '@arco-design/web-vue'

  const { path, title } = defineProps<{
    path: string[]
    title: string
  }>()

  const router = useRouter()
  const { setStatusBar, setStatusBarLeft } = useAppStore()
  const submenuSelectedKey = ref('')

  function getMenuByPath(pathArr: string[], menuTree: any): any {
    let levelPath = pathArr.shift()
    if (levelPath?.startsWith('/')) {
      levelPath = levelPath.substring(1)
    }
    for (let i = 0; i < menuTree.length; i += 1) {
      let iterPath = menuTree[i].path
      if (iterPath?.startsWith('/')) {
        iterPath = iterPath.substring(1)
      }
      if (iterPath === levelPath) {
        if (pathArr.length) {
          return getMenuByPath(pathArr, menuTree[i].children)
        }
        return menuTree[i].children
      }
    }
    return null
  }

  const { menuTree } = useMenuTree()

  const menu = computed(() => getMenuByPath(path.slice(), menuTree.value))
  const menuClick = (key: string) => {
    router.push({ name: key })
  }

  const menuClickWithMeta = (key: string) => {
    const url = router.resolve({ name: key })
    window.open(url.fullPath, '_blank')
  }

  listenerRouteChange((newRoute) => {
    const pageName = newRoute.path.substring(path.join('').length + path.length + 1)
    submenuSelectedKey.value = pageName as string
    // setStatusBar('ai', {text: 'progress 10%'}, 2000)
    // setStatusBarLeft('ai', {text: 'progress 10%'}, 2000)
    // setTimeout(() =>  setStatusBar('ai', {text: 'progress 100%', icon: 'icon-check-circle-fill', onClick: (item, evt) => {
    //   console.log('clicked', item, evt)
    // }}), 3000)
    // setStatusBar('ai2', h(Popover, {content: 'testt', trigger: 'click'}, [h(Button, {type: 'text', size: 'mini'},'testpopover')]))
  }, true)
</script>

<style scoped lang="less">
  .navbar {
    height: 100%;
    width: 100%;
  }

  .logo-space {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    .logo-text-img {
      height: 30px;
    }
  }

  .menu {
    width: 100%;

    .arco-menu {
      font-size: 13px;
    }
    :deep(.arco-menu-vertical .arco-menu-item.arco-menu-has-icon) {
      padding-left: 20px;
      margin-bottom: 2px;
      // border-left: 2px solid transparent;
      border-radius: 0;
      line-height: 30px;
    }
    :deep(.arco-menu-vertical .arco-menu-inner) {
      padding: 0;
    }

    :deep(.arco-menu-item.arco-menu-has-icon .arco-menu-icon) {
      margin-right: 10px;
    }
    :deep(.arco-menu-light .arco-menu-item.arco-menu-selected) {
      background-color: var(--light-brand-color);
      color: var(--brand-color);
      // border-left: 2px solid;
      border-radius: 0;
      border-color: var(--brand-color);
      font-weight: 600;
      .arco-menu-icon {
        color: var(--brand-color);
      }
    }
    .arco-menu-horizontal {
      background-color: transparent;

      :deep(.arco-menu-inner) {
        overflow-y: hidden;
        padding: 0;
      }

      .arco-menu-item {
        padding: 6px 12px;

        line-height: 18px;
        background-color: transparent;
        color: var(--color-primary);
        user-select: none;
        opacity: 0.6;
        margin-left: 0;
      }
      .disabled-menu {
        cursor: not-allowed;
        .arco-menu-item {
          pointer-events: none;
        }
      }
      :deep(.arco-menu-selected-label) {
        display: none;
      }
      .arco-menu-item.arco-menu-selected {
        background: rgb(255 255 255 / 15%);
        border-radius: 4px;
        opacity: 1;
        font-weight: 600;
        svg {
          color: var(--color-primary);
        }
      }

      :deep(.arco-menu-pop.arco-menu-pop-header.arco-menu-overflow-sub-menu) {
        color: var(--white-font-color);
        background-color: transparent;
        opacity: 0.6;
      }
      :deep(.arco-menu-pop.arco-menu-pop-header.arco-menu-selected.arco-menu-overflow-sub-menu) {
        opacity: 1;
        background: rgba(255, 255, 255, 0.15);
        border-radius: 4px;
      }
    }
  }
</style>
