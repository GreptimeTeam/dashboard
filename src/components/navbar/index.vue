<template lang="pug">
.navbar
  .logo-space
    img.logo-text-img(alt="logo" src="/src/assets/images/logo-text.webp")
  .menu(v-permission="['dev']")
    a-menu(mode="horizontal" v-model="menuSelectedKey" :default-selected-keys="defaultMenuKey" @menu-item-click="menuClick")
      a-menu-item(key="query")
        | Query
      a-menu-item(key="scripts")
        | Scripts
      a-menu-item(key="notebook")
        | Notebook
  ul.right-side
    li
      a-button(type="primary" @click="createPlayground") Open New playground
      a-button(type="primary" @click="showPlayground") show Playground Info
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
  import { postPlayground, getPlayground } from '@/api/playground'

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

  const createPlayground = async () => {
    window.grecaptcha.ready(() => {
      window.grecaptcha
        .execute('6LcsBPgkAAAAAKiPrwh3pFCKpv9hc62eRhL5bj5A', { action: 'submit' })
        .then(async (token: string) => {
          try {
            const data = (await postPlayground(token)) as any
            window.open(
              `https://${data.domain['aws/test-ap-southeast-1']}/dashboard/notebook?username=${data.username}&password=${data.password}&database=${data.teamId}-${data.serviceName}&dbId=${data.dbId}`
            )
          } catch (error) {
            console.log(`error:`, error)
          }
        })
    })
  }

  const showPlayground = async () => {
    const data = await getPlayground(appStore.dbId)
  }
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

  .arco-btn {
    margin-right: 10px;
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
      }
      .arco-menu-item:last-child {
        margin-left: 16px;
      }
      .arco-menu-item:not(:last-child) {
        margin-left: 0;
      }
      :deep(.arco-menu-selected-label) {
        display: none;
      }
      .arco-menu-item.arco-menu-selected {
        background: rgb(255 255 255 / 15%);
        border-radius: 4px;
        opacity: 1;
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
