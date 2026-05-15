<template lang="pug">
a-layout.navbar
  a-layout-header.logo-space
    svg.logo
      use(href="#logo")
  a-layout-content
    a-menu(
      mode="vertical"
      theme="dark"
      collapsed
      :selected-keys="[menuSelectedKey]"
    )
      a-menu-item(
        v-for="item in menu"
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
      li.footer-separator
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
                use(href="#more")
          template(#content)
            a-doption(v-for="{ label, link } in dropDownLinks")
              a-link(target="_blank" :href="link")
                | {{ label }}
            a-doption.news(@click="showNews")
              | {{ $t('menu.news') }}
NewsModal(ref="newsModal" :news-list="newsListMutable" :loading="isLoadingNews")
</template>

<script lang="ts" setup name="NavBar">
  import { useI18n } from 'vue-i18n'
  import { listenerRouteChange } from '@/utils/route-listener'
  import { useNews } from '@/hooks/news'
  import useMenuTree from '../menu/use-menu-tree'
  import NewsModal from './news-modal.vue'

  const router = useRouter()
  const { t } = useI18n()
  const appStore = useAppStore()
  const { menuSelectedKey, globalSettings } = storeToRefs(appStore)
  const { activeTab: ingestTab } = storeToRefs(useIngestStore())
  const { menuTree } = useMenuTree()
  const { newsList, isLoadingNews } = useNews()
  const newsListMutable = computed(() => (newsList.value ? [...newsList.value] : []))
  const newsModal = ref()

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
    appStore.openGlobalSettings()
  }

  const showNews = () => {
    newsModal.value.show()
  }

  const menuClick = (key: string) => {
    if (key !== menuSelectedKey.value) {
      appStore.applyUiConfig({ hideSidebar: false })
    }
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
    appStore.applyUiConfig({
      menuSelectedKey: newRoute.meta.activeMenu || (newRoute.matched[1].name as string),
    })
    if (newRoute.matched[1].name === 'ingest') {
      ingestTab.value = newRoute.matched[3].name as string
    }
  }, true)
</script>

<style scoped lang="less">
  .navbar {
    height: 100%;
    overflow-y: auto;
    background: var(--gpt-brand-900);
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .logo-space {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--gpt-radius-lg) 0;
  }

  .logo {
    width: calc(var(--gpt-size-navbar) / 2);
    height: calc(var(--gpt-size-navbar) / 2);
    color: var(--gpt-brand-300);
    fill: currentColor;
  }

  :deep(.arco-menu-icon) {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :deep(.arco-menu-collapsed .arco-menu-item.arco-menu-has-icon) {
    justify-content: center;
    padding: 9px 8px;
  }

  :deep(.arco-menu-collapsed .arco-menu-icon) {
    margin-right: 0;
  }

  :deep(.arco-menu-dark .arco-menu-item .arco-menu-icon),
  :deep(.arco-menu-dark .arco-menu-item svg) {
    color: rgba(255, 255, 255, 1);
  }

  :deep(.arco-menu-dark .arco-menu-item.arco-menu-selected .arco-menu-icon),
  :deep(.arco-menu-dark .arco-menu-item.arco-menu-selected svg) {
    color: var(--gpt-brand-300);
  }

  :deep(.arco-menu-collapsed .arco-menu-item-inner) {
    display: none;
  }

  :deep(.arco-menu-collapsed .arco-menu-item.arco-menu-selected::before) {
    content: '';
    position: absolute;
    left: 0;
    top: calc((100% - 20px) / 2);
    width: 3px;
    height: 20px;
    border-radius: 0 var(--gpt-radius-sm) var(--gpt-radius-sm) 0;
    background: var(--gpt-nav-active-indicator);
  }

  .footer {
    display: flex;
    list-style: none;
    flex-direction: column;
    padding: 0;
    margin: 0;
    gap: var(--gpt-radius-sm);
    align-items: center;
    .arco-btn-text[type='button'] {
      color: var(--gpt-text-inverse-muted);
    }
    .arco-btn-text[type='button']:hover,
    .arco-btn-text.hover,
    .arco-btn-text.arco-dropdown-open {
      background: var(--gpt-nav-active-bg);
      :deep(.arco-btn-icon) {
        color: var(--gpt-brand-300);
      }
    }
    :deep(.arco-btn-icon) {
      color: rgba(255, 255, 255, 0.5);
    }

    li {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .footer-separator {
      width: calc(var(--gpt-size-navbar) - var(--gpt-radius-lg) * 2);
      border-top: 1px solid var(--gpt-border-inverse-subtle);
      margin: var(--gpt-radius-sm) 0;
    }
  }
</style>
