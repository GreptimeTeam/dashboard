<template lang="pug">
a-layout.new-layout
  a-layout-sider(:resize-directions="['right']" :width="275")
    a-card.sidebar(:title="$t('menu.dashboard.ingest')" :bordered="false")
      a-menu(
        mode="vertical"
        :selected-keys="[activeTab]"
        :collapsed="false"
        :default-open-keys="['influxdb']"
      )
        a-sub-menu(v-for="(item, index) in menu" :key="item.name")
          template(#title)
            svg.icon
              use(:href="`#${item.meta.icon}`")
            span {{ $t(item.meta.locale) }}
          a-menu-item(v-for="child in item.children" :key="child.name" @click="menuClick(item.name, child.name)")
            svg.icon
              use(:href="`#${child.meta.icon}`")
            span {{ $t(child.meta.locale) }}
  a-layout-content.layout-content(:class="{ 'has-panel': !footer[activeTab] }")
    a-space.layout-space(direction="vertical" fill :size="0")
      router-view(v-slot="{ Component }")
        keep-alive
          component(:is="Component")
      a-resize-box.panel-resize(
        v-if="!footer[activeTab]"
        :key="activeTab"
        :directions="['top']"
        :style="{ 'max-height': '40vh', 'min-height': '74.85px' }"
      )
        a-tabs.panel-tabs
          a-tab-pane(title="Log" key="log")
            LogsNew(:key="activeTab" :logs="ingestLogs" :types="[activeTab]")
          template(#extra)
            a-tooltip(content="Hide Panel" position="tr")
              a-button(type="text" size="mini" @click="footer[activeTab] = true")
                template(#icon)
                  svg.icon-12
                    use(href="#pull-down")
</template>

<script lang="ts" setup name="Ingest">
  import useMenuTree from '@/components/menu/use-menu-tree'
  import router from '@/router'
  import { useStorage } from '@vueuse/core'
  import type { StatusContentSimple } from '@/store/modules/status-bar'
  import { driver } from 'driver.js'
  import 'driver.js/dist/driver.css'
  import { useI18n } from 'vue-i18n'
  import { navbarSteps } from '../config'
  import PanelIcon from './panel-icon.vue'

  const route = useRoute()
  const { t } = useI18n()
  const { menuTree } = useMenuTree()
  const { activeTab, footer } = storeToRefs(useIngestStore())
  const { logs } = storeToRefs(useLogStore())
  const { dataStatusMap } = storeToRefs(useUserStore())
  const { checkTables } = useDataBaseStore()
  const { fetchDatabases } = useAppStore()
  const panelId = ref<number | null>(null)

  const ingestLogs = computed(() => {
    return logs.value.filter((log) => activeTab.value.includes(log.type))
  })

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
    const { statusRight } = storeToRefs(useStatusBarStore())
    const { add } = useStatusBarStore()
    const statusItem: StatusContentSimple = {
      icon: shallowRef(PanelIcon),
      onClick: () => {
        footer.value[activeTab.value] = !footer.value[activeTab.value]
      },
    }
    panelId.value = add(statusItem, { pos: 'right' })

    const tourStatus = useStorage('tourStatus', { navbar: false })
    if (!tourStatus.value.navbar) {
      globalTour.setSteps(navbarSteps)
      globalTour.drive(0)
    }
    if (!dataStatusMap.value.tables) {
      await fetchDatabases()
      await checkTables()
    }
  })

  onDeactivated(() => {
    const { remove } = useStatusBarStore()
    remove(panelId.value as number)
  })
</script>

<style lang="less" scoped>
  :deep(.layout-space) {
    height: calc(100% - 18px);
  }
  :deep(.arco-card.sidebar) {
    height: 100%;
    border-radius: 0;

    .arco-card-header {
      height: 52px;
    }
    .arco-menu {
      .icon {
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
            right: 15px;
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

  .has-panel {
    :deep(.arco-card.light-editor-card) {
      .ͼ1.cm-editor {
        border-bottom: none;
        border-radius: 4px 4px 0 0;
      }
    }
  }
</style>
