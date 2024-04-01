<template lang="pug">
a-layout.layout
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
    a-layout-footer(v-if="footer[activeTab]")
      div
      a-tooltip(content="Show Panel" position="tr")
        a-button(type="text" size="mini" @click="footer[activeTab] = false")
          template(#icon)
            svg.icon
              use(href="#log")
</template>

<script lang="ts" setup name="Ingest">
  import useMenuTree from '@/components/menu/use-menu-tree'
  import router from '@/router'
  import { useI18n } from 'vue-i18n'

  const route = useRoute()
  const { t } = useI18n()
  const { menuTree } = useMenuTree()
  const { activeTab, footer } = storeToRefs(useIngestStore())
  const { logs } = storeToRefs(useLogStore())

  const ingestLogs = computed(() => {
    return logs.value.filter((log) => activeTab.value.includes(log.type))
  })

  const menu = menuTree.value[0].children[1].children

  const menuClick = (parent: string, child: string) => {
    router.push({ name: child })
  }
</script>

<style lang="less" scoped>
  .layout {
    padding: 0;
    background: var(--card-bg-color);
    > .arco-layout-sider {
      min-width: 210px;
      max-width: 40vw;
      border-left: 1px solid var(--border-color);
    }
  }
  .layout-content {
    padding: 20px 20px 0 20px;
    height: 100vh;
  }
  .arco-layout-footer {
    display: flex;
    justify-content: space-between;
    .arco-btn-size-mini.arco-btn-only-icon {
      width: 26px;
      height: 26px;
      padding: 0;
    }
  }
  :deep(.layout-space) {
    height: calc(100% - 26px);
    > .arco-space-item:first-of-type {
      flex: 1;
      overflow: auto;
    }
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
  :deep(.arco-tabs.panel-tabs) {
    display: flex;
    flex-direction: column;
    height: 100%;
    border-top: 1px solid var(--border-color);

    .arco-tabs-content-list {
      height: 100%;
    }

    .arco-tabs-content .arco-tabs-content-item {
      height: 100%;
      // TODO: better scrollbar style
      max-height: calc(40vh - 32px - 20px);
      overflow: auto;
    }
    .arco-tabs-tab {
      border-radius: 0;
      border-top: none;
      height: 100%;
      margin: 0;
      padding: 0 15px;
    }
    .arco-tabs-content {
      padding: 0 0 20px 0;
    }
    .arco-tabs-nav-ink {
      background: var(--brand-color);
    }
    .arco-tabs-nav {
      height: 26px;
      background: var(--th-bg-color);
      &:before {
        display: none;
      }
    }
    .arco-tabs-nav-tab {
      height: 100%;
    }
    .arco-tabs-tab-active {
      color: var(--main-font-color);
      background: var(--card-bg-color);
    }
    :deep(> .arco-tabs-content) {
      height: calc(100% - 30px);
      // TODO: better scrollbar style
      overflow: auto;
    }
  }

  .has-panel {
    :deep(.layout-space) {
      height: 100%;
    }
    :deep(.arco-card.light-editor-card) {
      .ͼ1.cm-editor {
        border-bottom: none;
        border-radius: 4px 4px 0 0;
      }
    }
  }
</style>

<style lang="less">
  .main-content {
    height: calc(100% - 48px);
  }
</style>
