<template lang="pug">
.navbar
  .left-side
    img.logo-text-img(alt="logo" src="/src/assets/images/logo-text.webp")
    .menu(v-permission="['dev']")
      a-menu(mode="horizontal" v-model="menuSelectedKey" :default-selected-keys="defaultMenuKey" @menu-item-click="menuClick")
        a-menu-item(key="query")
          | Query
        a-menu-item(key="scripts")
          | Scripts
  ul.right-side
    li
      a-tooltip(:content="$t('settings.title')")
        div.pointer
          svg.icon-20(@click="setVisible")
            use(href="#setting")
    li
      a-dropdown(trigger="hover" position="br" :popup-max-height="false")
        div.pointer
          svg.icon-20
            use(href="#dropdown")
        template(#content)
          a-doption(v-for="{ label, link } in dropDownLinks")
            a-link(:href="link" target="_blank")
              | {{ label }}
</template>

<script lang="ts" setup>
  import router from '@/router'

  const appStore = useAppStore()
  const menuSelectedKey = router.currentRoute.value.name
  const defaultMenuKey = [router.currentRoute.value.name]

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
    appStore.updateSettings({ globalSettings: true })
  }

  const menuClick = (key: string) => {
    router.push({ name: key })
  }
</script>

<style scoped lang="less">
  .navbar {
    display: flex;
    justify-content: space-between;
    height: 100%;
    background: var(--navbar-bg-color);
  }

  .left-side {
    display: flex;
    padding-left: 20px;

    .logo-text-img {
      height: 100%;
    }
  }

  .menu {
    width: 230px;
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

  .arco-menu-light {
    background-color: transparent;
    .arco-menu-item {
      background-color: transparent;
      color: var(--card-bg-color);
      user-select: none;
      &.arco-menu-selected:hover {
        background-color: transparent;
      }
    }
    :deep(.arco-menu-selected-label) {
      background-color: var(--card-bg-color);
    }
  }
</style>
