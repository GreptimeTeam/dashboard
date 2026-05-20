<template lang="pug">
a-layout.dashboard-two-column-layout.dashboard-right-fill-layout
  a-layout-sider(:resize-directions="['right']" :width="228" :class="hideSidebar ? 'hide-sider' : ''")
    a-card.gpt-page-sidebar(:title="$t('menu.dashboard.ingest')" :bordered="false")
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
  import { useStorage } from '@vueuse/core'
  import { driver } from 'driver.js'
  import 'driver.js/dist/driver.css'
  import { navbarSteps } from '../config'

  const router = useRouter()
  const { menuTree } = useMenuTree()
  const { hideSidebar } = storeToRefs(useAppStore())
  const { activeTab } = storeToRefs(useIngestStore())

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
