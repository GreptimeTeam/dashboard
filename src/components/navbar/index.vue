<template lang="pug">
a-layout.navbar
  a-layout-header.logo-space
    svg.logo
      use(href="#logo")
  a-layout-content
    .new-query
    .menu
      a-menu(mode="vertical" collapsed :selected-keys="[menuSelectedKey]")
        a-menu-item(
          v-for="(item, index) in menu"
          :key="item.name"
          @click.meta="menuClickWithMeta(item.name)"
          @click.ctrl="menuClickWithMeta(item.name)"
          @click.exact="menuClick(item.name)"
        )
          span {{ $t(item.meta.locale) }}
          template(#icon)
            svg.icon-18(:id="`menu-${item.name}`")
              use(:href="`#${item.meta.icon}`") 
  a-layout-footer
    ul.footer
      li
        a-tooltip(:content="$t('settings.title')")
          a-button(type="text" :class="{ hover: globalSettings }" @click="setVisible")
            template(#icon)
              svg.icon-16
                use(href="#settings")
      li
        a-dropdown.menu-dropdown(trigger="hover" position="right" :popup-max-height="false")
          a-button.menu-button(type="text")
            template(#icon)
              svg.icon
                use(href="#menu")
          template(#content)
            a-doption(v-for="{ label, link } in dropDownLinks")
              a-link(target="_blank" :href="link")
                | {{ label }}
</template>

<script lang="ts" setup name="NavBar">
  import { listenerRouteChange } from '@/utils/route-listener'
  import useMenuTree from '../menu/use-menu-tree'

  const router = useRouter()
  const { updateSettings } = useAppStore()
  const { menuSelectedKey, globalSettings, isFullScreen } = storeToRefs(useAppStore())
  const { activeTab: ingestTab } = storeToRefs(useIngestStore())
  const { menuTree } = useMenuTree()

  const menu = menuTree.value[0].children

  const dropDownLinks = [
    {
      link: 'https://greptime.com/',
      label: 'Home',
    },
    {
      link: 'https://docs.greptime.com/',
      label: 'Docs',
    },
    {
      link: 'https://github.com/GreptimeTeam/dashboard',
      label: 'GitHub | Dashboard',
    },
    {
      link: 'https://github.com/GreptimeTeam/greptimedb',
      label: 'GitHub | GreptimeDB',
    },
  ]

  const setVisible = () => {
    updateSettings({ globalSettings: true })
  }

  const menuClick = (key: string) => {
    // if (key === menuSelectedKey.value) {
    //   isFullScreen.value = !isFullScreen.value
    // }
    switch (key) {
      case 'ingest':
        router.push({ name: ingestTab.value || 'ingest' })
        break
      default:
        router.push({ name: key })
        break
    }
  }

  const menuClickWithMeta = (key: string) => {
    const url = router.resolve({ name: key })
    window.open(url.fullPath, '_blank')
  }

  listenerRouteChange((newRoute) => {
    menuSelectedKey.value = newRoute.matched[1].name as string
    if (newRoute.matched[1].name === 'ingest') {
      ingestTab.value = newRoute.matched[3].name as string
    }
  }, true)
</script>

<style scoped lang="less">
  .navbar {
    height: 100%;
    width: 100%;
  }

  .logo-space {
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .logo {
    height: 32px;
    width: 32px;
  }

  .menu {
    width: 100%;

    .arco-menu {
      font-size: 14px;
    }

    .arco-menu-collapsed {
      width: 100%;
    }
    :deep(.arco-menu-vertical .arco-menu-item.arco-menu-has-icon) {
      margin-bottom: 2px;
      border-left: 2px solid transparent;
      border-radius: 0;
      line-height: 38px;
      display: flex;
      justify-content: center;
      margin-right: 2px;
    }
    :deep(.arco-menu-vertical .arco-menu-inner) {
      padding: 0;
    }

    :deep(.arco-menu-title) {
      width: 0;
    }

    :deep(.arco-menu-light .arco-menu-item) {
      &:hover {
        background-color: transparent;
        .arco-menu-icon {
          background-color: var(--th-bg-color);
        }
      }
    }

    :deep(.arco-menu-item.arco-menu-has-icon .arco-menu-icon) {
      margin-right: 0;
      padding: 10px 13px;
      border-radius: 4px;
      color: var(--small-font-color);
    }
    :deep(.arco-menu-light .arco-menu-item.arco-menu-selected) {
      background-color: transparent;
      color: var(--brand-color);
      border-left: 2px solid;
      border-radius: 0;
      border-color: var(--brand-color);
      .arco-menu-icon {
        color: var(--brand-color);
        background-color: var(--light-brand-color);
      }
    }
  }

  .footer {
    display: flex;
    list-style: none;
    flex-direction: column;
    padding: 0;
    margin: 0;
    .arco-btn-text[type='button'] {
      color: var(--small-font-color);
      font-size: 13px;
      display: flex;
      border: none;
      height: 38px;
      border-radius: 4px;
      width: 44px;
      &:not(.arco-btn-only-icon) {
        padding-left: 86px;
        justify-content: flex-start;
      }
    }
    .arco-btn-text[type='button']:hover,
    .arco-btn-text.hover,
    .arco-btn-text.arco-dropdown-open {
      background: var(--list-hover-color);
      :deep(.arco-btn-icon) {
        color: var(--main-font-color);
      }
    }
    :deep(.arco-btn-icon) {
      color: var(--small-font-color);
    }

    :deep(.arco-btn-size-medium:not(.arco-btn-only-icon) .arco-btn-icon) {
      display: flex;
      width: 16px;
    }

    li {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .arco-link {
      color: var(--card-bg-color);
      transition: color 0.25s;
    }
    :deep(.arco-link:hover) {
      background: transparent;
      color: var(--brand-color);
    }

    .social-links {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
    }
  }

  .new-query {
    padding: 15px 18px 4px 18px;
    .arco-btn {
      width: 100%;
      height: 38px;
      :first-child {
        font-size: 26px;
      }
      font-size: 14px;
    }
  }

  .arco-btn-text[type='button'].menu-button {
    border: none;
  }

  .arco-btn-text[type='button'].feedback-button {
    border: none;
  }

  .buttons-space {
    border-top: 1px solid var(--border-color);
    > :first-child {
      width: 50%;
    }
    > :last-child {
      width: 50%;
    }
    .arco-divider-vertical {
      margin: 0;
      height: 26px;
      border-color: var(--border-color);
    }
  }
</style>
