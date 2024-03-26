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
    router-view(v-slot="{ Component }")
      keep-alive
        component(:is="Component")
    LogsNew(v-if="ingestLogs.length" :logs="ingestLogs" :types="[activeTab]")
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

  const ingestLogs = computed(() => logs.value.filter((log) => activeTab.value.includes(log.type)))

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
    padding: 20px;
  }
</style>

<style lang="less">
  .main-content {
    height: calc(100% - 52px);
  }
</style>
