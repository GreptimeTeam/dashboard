<template lang="pug">
a-layout.navbar
  a-layout-header
    .logo-space
      img.logo-text-img(alt="logo" src="/src/assets/images/logo-text.png")
  a-layout-content
    .new-query
      a-button(type="primary" @click="openQuery")
        span +
        span New Query
    .menu
      a-menu(mode="vertical" :selected-keys="[menuSelectedKey]")
        a-menu-item(
          v-for="(item, index) in menu"
          :key="item.name"
          @click.meta="menuClickWithMeta(item.name)"
          @click.ctrl="menuClickWithMeta(item.name)"
          @click.exact="menuClick(item.name)"
        )
          span {{ $t(item.meta.locale) }}
          template(#icon)
            svg.icon-18
              use(:href="`#${item.meta.icon}`") 
  a-layout-footer
    ul.footer
      li
        a-button(style="width: 100%" :class="{ hover: globalSettings }" @click="setVisible")
          template(#icon)
            svg.icon-20
              use(href="#settings")
          | {{ $t('settings.title') }}
      li
        a-dropdown.menu-dropdown(trigger="hover" position="right" :popup-max-height="false")
          a-button(style="width: 100%")
            template(#icon)
              svg.icon-18
                use(href="#menu")
            | {{ $t('navbar.docs') }}
          template(#content)
            a-doption(v-for="{ label, link } in dropDownLinks")
              a-link(target="_blank" :href="link")
                | {{ label }}
</template>

<script lang="ts" setup name="NavBar">
  import router from '@/router'
  import { useAppStore } from '@/store'
  import { listenerRouteChange } from '@/utils/route-listener'
  import useMenuTree from '../menu/use-menu-tree'

  const { updateSettings } = useAppStore()
  const { menuSelectedKey, globalSettings } = storeToRefs(useAppStore())
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
    router.push({ name: key })
  }

  const menuClickWithMeta = (key: string) => {
    const url = router.resolve({ name: key })
    window.open(url.fullPath, '_blank')
  }

  listenerRouteChange((newRoute) => {
    menuSelectedKey.value = newRoute.name as string
  }, true)

  const openQuery = () => {
    updateSettings({ queryModalVisible: true })
  }
</script>

<style scoped lang="less">
  .navbar {
    height: 100%;
    width: 100%;
  }

  .logo-space {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    .logo-text-img {
      height: 32px;
    }
  }

  .menu {
    width: 100%;
    :deep(.arco-menu-vertical .arco-menu-item.arco-menu-has-icon) {
      padding-left: 39px;
      margin-bottom: 2px;
      border-left: 2px solid transparent;
      border-radius: 0;
    }
    :deep(.arco-menu-vertical .arco-menu-inner) {
      padding: 0;
    }

    :deep(.arco-menu-item.arco-menu-has-icon .arco-menu-icon) {
      margin-right: 8px;
    }
    :deep(.arco-menu-light .arco-menu-item.arco-menu-selected) {
      background-color: var(--light-brand-color);
      color: var(--brand-color);
      border-left: 2px solid;
      border-radius: 0;
      border-color: var(--brand-color);
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
        color: var(--white-font-color);
        user-select: none;
        opacity: 0.6;
        margin-left: 0;
      }
      :deep(.arco-menu-selected-label) {
        display: none;
      }
      .arco-menu-item.arco-menu-selected {
        background: rgb(255 255 255 / 15%);
        border-radius: 4px;
        opacity: 1;
        font-weight: 600;
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

  .footer {
    display: flex;
    list-style: none;
    flex-direction: column;
    padding: 0 24px;
    .arco-btn-secondary[type='button'] {
      background: var(--th-bg-color);
      color: var(--small-font-color);
      font-size: 16px;
      display: flex;
      justify-content: flex-start;
      padding-left: 62px;
    }
    .arco-btn-secondary[type='button']:hover,
    .arco-btn-secondary.hover,
    .arco-btn-secondary.arco-dropdown-open {
      border-color: inherit;
      background: var(--light-brand-color);
      color: var(--brand-color);
      :deep(.arco-btn-icon) {
        color: var(--brand-color);
      }
    }
    :deep(.arco-btn-icon) {
      width: 20px;
      color: var(--third-font-color);
    }

    li {
      display: flex;
      align-items: center;
      &:first-of-type {
        margin-bottom: 2px;
      }
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
    padding: 24px;
    .arco-btn {
      width: 100%;
      height: 44px;
      :first-child {
        font-size: 26px;
        padding-right: 4px;
      }
    }
  }
</style>
