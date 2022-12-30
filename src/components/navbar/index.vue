<template lang="pug">
.navbar
  .left-side
    img.logo-text-img(alt='logo' src='/src/assets/images/logo-text.webp')
  .menu
    a-menu(mode="horizontal" v-model="menuSelectedKey" :default-selected-keys="defaultMenuKey" @menu-item-click="menuClick")
      a-menu-item(key="sql")
        |SQL 
      a-menu-item(key="scripts")
        |Scripts
  ul.right-side
    li
      a-dropdown(trigger="hover" position="br" :popup-max-height="false")
        svg.icon-24.pointer
          use(href="#dropdown")
        template(#content)
          a-doption(v-for="{label, link} in dropDownLinks")
            a-link(:href="link" target="_blank" ) {{ label }}
</template>

<script lang="ts" setup>
  import router from '@/router'

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
    align-items: center;
    padding-left: 20px;

    .logo-text-img {
      height: 100%;
    }
  }

  .menu {
    width: 300px;
  }

  .right-side {
    display: flex;
    list-style: none;

    li {
      display: flex;
      align-items: center;
      margin-right: 30px;
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
    opacity: 0.4;
  }
</style>
