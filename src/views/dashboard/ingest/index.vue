<template lang="pug">
a-layout.dashboard-two-column-layout.dashboard-right-fill-layout
  a-layout-sider(:resize-directions="['right']" :width="228" :class="hideSidebar ? 'hide-sider' : ''")
    a-card.sidebar.gpt-sidebar-header-card.gpt-vertical-scrollbar(
      :title="$t('menu.dashboard.ingest')"
      :bordered="false"
    )
      a-menu(
        mode="vertical"
        :selected-keys="[activeTab]"
        :collapsed="false"
        :default-open-keys="['influxdb', 'log-ingestion']"
      )
        a-sub-menu(v-for="(item, index) in menu" :key="item.name")
          template(#title)
            svg.icon-15
              use(:href="`#${item.meta.icon}`")
            span {{ $t(item.meta.locale) }}
          a-menu-item(v-for="child in item.children" :key="child.name" @click="menuClick(item.name, child.name)")
            svg.icon
              use(:href="`#${child.meta.icon}`")
            span {{ $t(child.meta.locale) }}
  a-layout-content.layout-content
    router-view(v-slot="{ Component }")
      keep-alive
        component(:is="Component")
</template>

<script lang="ts" setup name="Ingest">
  import useMenuTree from '@/components/menu/use-menu-tree'
  import { useStorage } from '@vueuse/core'
  import { driver } from 'driver.js'
  import 'driver.js/dist/driver.css'
  import { navbarSteps } from '../config'

  const router = useRouter()
  const route = useRoute()
  const { menuTree } = useMenuTree()
  const { hideSidebar } = storeToRefs(useAppStore())
  const { activeTab } = storeToRefs(useIngestStore())
  const { dataStatusMap } = storeToRefs(useUserStore())

  const menu = menuTree.value[0].children.filter((item: any) => item.name === 'ingest')[0].children

  const menuClick = (parent: string, child: string) => {
    router.push({ name: child })
  }

  const globalTour = driver({
    showProgress: false,
    allowClose: false,
    disableActiveInteraction: true,
    overlayOpacity: 0.4,
    showButtons: ['next', 'close'],
    stagePadding: 7,
    stageRadius: 4,
    popoverClass: 'global',
    popoverOffset: 10,
    steps: [],

    onCloseClick: () => {
      const tourStatus = useStorage('tourStatus', { navbar: false })
      tourStatus.value.navbar = true
      globalTour.destroy()
    },

    onNextClick: () => {
      const tourStatus = useStorage('tourStatus', { navbar: false })
      tourStatus.value.navbar = true
      globalTour.moveNext()
      if (!globalTour.getActiveStep()) {
        globalTour.destroy()
      }
    },
  })

  onActivated(async () => {
    const tourStatus = useStorage('tourStatus', { navbar: false })
    if (!tourStatus.value.navbar) {
      globalTour.setSteps(navbarSteps)
      globalTour.drive(0)
    }
  })
</script>

<style lang="less" scoped>
  :deep(.arco-card.sidebar) {
    .arco-menu {
      .icon,
      .icon-15 {
        margin-right: 6px;
      }
      .arco-menu-inner {
        padding: 0;
        .arco-menu-inline-header {
          display: flex;
          align-items: center;
          margin: 0;
          padding: 0 15px;
          font-size: 13px;
          height: 30px;
          line-height: 30px;
          border-radius: 0;
          .arco-menu-icon-suffix {
            display: none;
          }
          &.arco-menu-selected {
            color: var(--brand-color);
            font-weight: 600;
            .arco-icon {
              color: var(--brand-color);
            }
          }
        }
        .arco-menu-item {
          margin: 0;
          padding-left: 35px;
          height: 28px;
          line-height: 28px;
          font-size: 13px;
          border-radius: 0;
          &:hover {
            background-color: var(--th-bg-color);
          }
          &.arco-menu-selected {
            font-weight: 600;
            background: var(--light-brand-color);
            color: var(--brand-color);
          }
          .arco-menu-indent {
            width: 0;
          }
          .arco-menu-item-inner {
            display: inline-flex;
            align-items: center;
          }
        }
      }
    }
  }
</style>
