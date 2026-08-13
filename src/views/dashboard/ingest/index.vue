<template lang="pug">
a-layout.dashboard-two-column-layout.dashboard-right-fill-layout
  a-layout-sider(:resize-directions="['right']" :width="228" :class="hideSidebar ? 'hide-sider' : ''")
    a-card.gpt-page-sidebar.gpt-sidebar-header-card(:title="$t('menu.dashboard.ingest')" :bordered="false")
      a-scrollbar.gpt-vertical-scrollbar
        a-menu.gpt-sidebar-menu(mode="vertical" :selected-keys="[activeTab]" :collapsed="false")
          a-menu-item-group.gpt-sidebar-menu-category(v-for="item in menu" :key="item.name")
            template(#title)
              span.gpt-sidebar-menu-category-text {{ $t(item.meta.locale) }}
            a-menu-item(
              v-for="child in item.children"
              :key="child.name"
              long
              @click="menuClick(item.name, child.name)"
            )
              template(#icon)
                svg.icon
                  use(:href="`#${child.meta.icon}`")
              span.gpt-sidebar-menu-text {{ $t(child.meta.locale) }}
  a-layout-content.layout-content
    router-view(v-slot="{ Component }")
      keep-alive
        component(:is="Component")
</template>

<script lang="ts" setup name="Ingest">
  import useMenuTree from '@/components/menu/use-menu-tree'

  const router = useRouter()
  const { menuTree } = useMenuTree()
  const { hideSidebar } = storeToRefs(useAppStore())
  const { activeTab } = storeToRefs(useIngestStore())

  const menu = menuTree.value[0].children.filter((item: any) => item.name === 'ingest')[0].children

  const menuClick = (parent: string, child: string) => {
    router.push({ name: child })
  }
</script>
