<template lang="pug">
a-layout.navbar(:class="{ 'navbar--collapsed': menuCollapse }")
  a-layout-header.logo-space
    .logo-brand(v-if="!menuCollapse")
      svg.logo
        use(href="#logo")
      span.logo-text Greptime
    svg.logo(v-else)
      use(href="#logo")
  a-layout-content.menu-content
    a-menu.navbar-menu(
      mode="vertical"
      theme="light"
      :collapsed="menuCollapse"
      :selected-keys="[menuSelectedKey]"
      @collapse="onMenuCollapse"
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
    ul.footer(:class="{ 'footer--expanded': !menuCollapse }")
      li.footer-top-divider(v-if="menuCollapse" aria-hidden="true")
      .footer-row
        .footer-start
          a-tooltip(:content="$t('settings.title')")
            a-button(type="text" :class="{ hover: globalSettings }" @click="setVisible")
              template(#icon)
                svg.icon-16
                  use(href="#settings")
          a-dropdown.menu-dropdown(trigger="hover" position="right" :popup-max-height="false")
            a-button.menu-button(type="text")
              template(#icon)
                svg.icon-16
                  use(href="#Icon13")
            template(#content)
              a-doption(v-for="{ label, link } in dropDownLinks")
                a-link.navbar-dropdown-link(target="_blank" :href="link")
                  | {{ label }}
              a-doption.news(@click="showNews")
                | {{ $t('menu.news') }}
        .footer-end
          a-tooltip(:content="menuCollapse ? $t('dashboard.showSidebar') : $t('dashboard.hideSidebar')")
            a-button.footer-collapse-btn(type="text" @click="toggleMenuCollapse")
              template(#icon)
                svg.icon-16(:class="{ 'rotate-180': menuCollapse }")
                  use(href="#shrink")
NewsModal(ref="newsModal" :news-list="newsListMutable" :loading="isLoadingNews")
</template>

<script lang="ts" setup name="NavBar">
  import { listenerRouteChange } from '@/utils/route-listener'
  import { useNews } from '@/hooks/news'
  import useMenuTree from '../menu/use-menu-tree'
  import NewsModal from './news-modal.vue'

  const router = useRouter()
  const appStore = useAppStore()
  const { menuSelectedKey, globalSettings, menuCollapse } = storeToRefs(appStore)
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

  const toggleMenuCollapse = () => {
    appStore.applyUiConfig({ menuCollapse: !menuCollapse.value })
  }

  const onMenuCollapse = (collapsed: boolean) => {
    appStore.applyUiConfig({ menuCollapse: collapsed })
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
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    height: 100%;
    overflow-y: auto;
    background: var(--gpt-bg-header);
    border-right: 1px solid var(--gpt-border-default);
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }

    :deep(.arco-layout-header),
    :deep(.arco-layout-footer) {
      flex-shrink: 0;
    }

    :deep(.arco-layout-content) {
      flex: 1;
      min-height: 0;
    }
  }

  .logo-space {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    height: auto;
    padding: var(--gpt-radius-lg) 8px;
  }

  .navbar--collapsed .logo-space {
    justify-content: center;
    padding: var(--gpt-radius-lg) 0;
  }

  .logo-brand {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }

  .logo {
    flex-shrink: 0;
    width: calc(var(--gpt-size-navbar) / 2);
    height: calc(var(--gpt-size-navbar) / 2);
    color: var(--gpt-brand-900);
    fill: currentColor;
  }

  .logo-text {
    overflow: hidden;
    color: var(--gpt-brand-900);
    font-weight: 600;
    font-size: 14px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu-content {
    overflow-x: hidden;
    overflow-y: auto;
  }

  .navbar-menu {
    background: transparent;
  }

  :deep(.navbar-menu.arco-menu-light) {
    background: transparent;
  }

  :deep(.navbar-menu .arco-menu-inner) {
    padding: 8px;
  }

  :deep(.navbar-menu:not(.arco-menu-collapsed) .arco-menu-item) {
    height: auto;
    margin: 0 0 4px !important;
    padding: 8px 12px !important;
    color: var(--gpt-text-secondary);
    font-size: 12px;
    line-height: 20px;
    border-radius: var(--gpt-radius-sm);
  }

  :deep(.navbar-menu:not(.arco-menu-collapsed) .arco-menu-item.arco-menu-has-icon) {
    display: flex;
    align-items: center;
  }

  :deep(.navbar-menu .arco-menu-item .arco-menu-icon),
  :deep(.navbar-menu .arco-menu-item .arco-menu-icon svg) {
    color: var(--gpt-text-secondary);
  }

  :deep(.navbar-menu .arco-menu-item:hover) {
    color: var(--gpt-brand-900);
    background: var(--gpt-nav-active-bg);
  }

  :deep(.navbar-menu .arco-menu-item:hover .arco-menu-icon),
  :deep(.navbar-menu .arco-menu-item:hover .arco-menu-icon svg) {
    color: var(--gpt-brand-900);
  }

  :deep(.navbar-menu .arco-menu-item.arco-menu-selected) {
    color: var(--gpt-main-purple);
    font-weight: 600;
    background: var(--gpt-nav-active-bg);
  }

  :deep(.navbar-menu .arco-menu-item.arco-menu-selected .arco-menu-icon),
  :deep(.navbar-menu .arco-menu-item.arco-menu-selected .arco-menu-icon svg) {
    color: var(--gpt-main-purple);
  }

  :deep(.navbar-menu .arco-menu-item.arco-menu-selected::before) {
    content: '';
    position: absolute;
    top: calc((100% - 20px) / 2);
    left: 0;
    width: 3px;
    height: 20px;
    border-radius: 0 var(--gpt-radius-sm) var(--gpt-radius-sm) 0;
    background: var(--gpt-nav-active-indicator);
  }

  :deep(.arco-menu-icon) {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :deep(.navbar-menu.arco-menu-collapsed .arco-menu-inner) {
    padding: 4px;
  }

  :deep(.arco-menu-collapsed .arco-menu-item) {
    margin: 0 0 4px;
  }

  :deep(.arco-menu-collapsed .arco-menu-item.arco-menu-has-icon) {
    justify-content: center;
    padding: 8px;
  }

  :deep(.arco-menu-collapsed .arco-menu-icon) {
    margin-right: 0;
  }

  :deep(.arco-menu-collapsed .arco-menu-item-inner) {
    display: none;
  }

  .footer {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-radius-sm);
    align-items: center;
    padding: 4px 0;
    margin: 0;
    list-style: none;

    &.footer--expanded {
      padding: 4px 8px;
    }

    .footer-row {
      display: flex;
      flex-direction: column;
      gap: var(--gpt-radius-sm);
      align-items: center;
      width: 100%;
    }

    &.footer--expanded .footer-row {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 0;
    }

    .footer-start,
    .footer-end {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    &.footer--expanded .footer-start {
      flex-direction: row;
    }

    .arco-btn-text[type='button'] {
      color: var(--gpt-text-secondary);
    }

    .arco-btn-text[type='button']:hover,
    .arco-btn-text.hover,
    .arco-btn-text.arco-dropdown-open {
      color: var(--gpt-brand-900);
      background: var(--gpt-nav-active-bg);
    }

    .footer-start svg,
    .footer-end svg {
      color: var(--gpt-text-secondary);
      fill: currentColor;
    }

    .arco-btn-text[type='button']:hover svg,
    .arco-btn-text.hover svg,
    .arco-btn-text.arco-dropdown-open svg {
      color: var(--gpt-brand-900);
    }
  }

  .footer-top-divider {
    width: calc(var(--gpt-size-navbar) - var(--gpt-radius-lg) * 2);
    height: 0;
    margin: var(--gpt-radius-sm) 0;
    padding: 0;
    border-top: 1px solid var(--gpt-border-default);
  }

  .rotate-180 {
    transform: rotate(180deg);
  }
</style>

<style lang="less">
  a.arco-link.navbar-dropdown-link:not(.arco-btn):not(.arco-menu-item):not(.arco-menu-inline-header) {
    color: var(--small-font-color);

    &:hover {
      color: var(--small-font-color);
      text-decoration: none;
      background-color: var(--th-bg-color);
    }
  }
</style>
