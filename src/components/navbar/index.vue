<template lang="pug">
.navbar
  .left-side
    img(alt='logo', src='/src/assets/images/logo-text.webp', class="logo-text-img")
  ul.right-side
    li
      a-link(href="https://docs.greptime.com/") Docs
    li
      a-divider(direction="vertical")
    li(v-for="{link, icon} in socialLinks")
      a-tooltip(content='GitHub')
        SocialLink.social-links(
          :key="link"
          :icon="icon"
          :link="link")
        
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
    padding-left: 15px;

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
    }
    .arco-divider-vertical {
      margin: 0;
      width: 1px;
      height: 32px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      padding-right: 30px;
    }
    .arco-link {
      color: #ffffff;
    }

    .social-links {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
    }
  }
</style>
