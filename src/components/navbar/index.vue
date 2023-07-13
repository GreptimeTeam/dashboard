<template lang="pug">
.navbar
  .logo-space
    img.logo-text-img(alt="logo" src="/src/assets/images/logo-text.webp")
  .menu
    a-menu(mode="horizontal" :selected-keys="menuSelectedKey")
      a-menu-item(v-for="(item, index) in menuConfig" :key="item.key" v-permission="item.permission")
        span(
          @click.meta="menuClickWithMeta(item.key)"
          @click.ctrl="menuClickWithMeta(item.key)"
          @click.exact="menuClick(item.key)"
        ) {{ item.label }}
  ul.right-side
    li
      a-tooltip(:content="$t('settings.title')")
        .pointer
          svg.icon-20(@click="setVisible")
            use(href="#setting")
    li
      a-dropdown(trigger="hover" position="br" :popup-max-height="false")
        .pointer
          svg.icon-20
            use(href="#dropdown")
        template(#content)
          a-doption(v-for="{ label, link } in dropDownLinks")
            a-link(target="_blank" :href="link")
              | {{ label }}
</template>

<script lang="ts" setup name="NavBar">
  import router from '@/router'
  import { useAppStore } from '@/store'
  import { listenerRouteChange } from '@/utils/route-listener'

  const { updateSettings } = useAppStore()
  const menuSelectedKey = ref<string[]>([])

  const menuConfig = [
    {
      key: 'query',
      label: 'Query',
      permission: ['dev', 'cloud'],
    },
    {
      key: 'scripts',
      label: 'Scripts',
      permission: ['dev'],
    },
    {
      key: 'playground',
      label: 'Playground',
      permission: ['dev', 'cloud'],
    },
    {
      key: 'status',
      label: 'Status',
      permission: ['dev'],
    },
  ]

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
    menuSelectedKey.value = [newRoute.name as string]
  }, true)
</script>

<style scoped lang="less">
  .navbar {
    display: flex;
    justify-content: space-between;
    height: 100%;
    background: var(--navbar-bg-color);
  }

  .logo-space {
    padding-left: 20px;

    .logo-text-img {
      height: 100%;
    }
  }

  .menu {
    width: 100%;
    margin-left: 60px;
    .arco-menu-horizontal {
      background-color: transparent;
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
    }
  }

  .right-side {
    display: flex;
    list-style: none;
    margin-right: 30px;

    li {
      display: flex;
      align-items: center;
      margin-left: 24px;
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

  .arco-dropdown-open {
    opacity: 0.6;
  }
</style>
