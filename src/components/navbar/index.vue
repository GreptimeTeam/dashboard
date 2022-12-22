<template lang="pug">
.navbar
  .left-side
    img(alt='logo', src='/src/assets/images/logo-text.webp', class="logo-text-img")
  ul.right-side
    li
      a-link(href="https://docs.greptime.com/" target="_blank") Docs
    li
      a-dropdown(trigger="hover" :popup-max-height="false")
        img.pointer.navbar-svg(src="/src/assets/images/dropdown.svg" height="24")
        template(#content)
          a-doption(v-for="{label, link} in dropDownLinks")
            a-link(:href="link" target="_blank" ) {{ label }}
</template>

<script lang="ts" setup>
  import { useAppStore } from '@/store'

  const appStore = useAppStore()

  const socialLinks = [
    {
      icon: 'github',
      link: 'https://github.com/GreptimeTeam/dashboard',
    },
  ]

  const dropDownLinks = [
    {
      link: 'https://github.com/GreptimeTeam/dashboard',
      label: 'GitHub | dashboard',
    },
    {
      link: 'https://github.com/GreptimeTeam/greptimedb',
      label: 'GitHub | greptimedb',
    },
  ]
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
</style>
