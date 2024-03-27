<template lang="pug">
a-layout.layout
  a-layout-sider(:resize-directions="['right']" :width="275")
    a-card(:title="$t('menu.dashboard.ingest')" :bordered="false")
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
  a-layout-content.layout-content
    a-space.layout-space(direction="vertical" fill :size="0")
      router-view(v-slot="{ Component }")
        keep-alive
          component(:is="Component")
      a-tabs.panel-tabs(v-if="!footer" type="card")
        a-tab-pane(title="Log" key="log")
          LogsNew(:logs="ingestLogs" :types="[activeTab]")
        template(#extra)
          a-tooltip(content="Hide panel" position="tr")
            a-button(type="text" @click="footer = true")
              svg.icon
                use(href="#pull-down")
      a-layout-footer(v-else)
        div
        a-tooltip(content="Show panel for log" position="tr")
          a-button(type="text" @click="footer = false")
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
  const { activeTab } = storeToRefs(useIngestStore())
  const { logs } = storeToRefs(useLogStore())

  const footer = ref(true)

  const ingestLogs = computed(() => logs.value.filter((log) => activeTab.value.includes(log.type)))

  watch(ingestLogs, () => {
    if (ingestLogs.value.length > 0) {
      footer.value = false
    } else {
      footer.value = true
    }
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
  }
  .layout-content {
    padding: 20px 20px 0 20px;
  }
  .arco-layout-footer {
    display: flex;
    justify-content: space-between;
  }
  :deep(.layout-space) {
    height: 100%;
    > .arco-space-item:first-of-type {
      height: 100%;
    }
  }
  .panel-tabs {
    max-height: 155px;
    display: flex;
    flex-direction: column;
    height: 100%;
    :deep(> .arco-tabs-content) {
      height: calc(100% - 30px);
      // TODO: better scrollbar style

      overflow: auto;
    }
  }
</style>

<style lang="less">
  .main-content {
    height: calc(100% - 52px);
  }
</style>
