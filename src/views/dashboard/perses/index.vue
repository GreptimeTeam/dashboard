<template lang="pug">
a-layout.new-layout
  a-resize-box(
    v-model:width="sidebarWidth"
    :directions="['right']"
    :style="{ 'min-width': '160px', 'max-width': '40vw' }"
    :class="hideSidebar ? 'hide-sider' : ''"
  )
    a-layout-sider(:width="actualSidebarWidth")
      a-card.perses-sidebar(:bordered="false")
        .sidebar-header
          span.title {{ $t('menu.dashboard.perses') }}
          a-button(size="mini" type="primary" @click="handleCreateDashboard")
            | {{ $t('dashboard.createDashboard') || 'New' }}
        a-input.search-input(v-model="searchText" allow-clear placeholder="Search")
        a-list(:bordered="false" :split="false")
          a-list-item(
            v-for="item in filteredDashboards"
            :key="item.id"
            :class="{ active: item.id === selectedId }"
            @click="selectedId = item.id"
          )
            .list-item
              span.name {{ item.name }}
  a-layout-content.layout-content
    a-card.perses-content(:bordered="false")
      template(v-if="selectedDashboard")
        PersesDashboardIframe(
          :name="selectedDashboard.file.filename"
          :file="selectedDashboard.file"
          :dashboard-editable="true"
          :on-save="handleSaveDashboard"
        )
      template(v-else)
        .empty-state
          h3 No dashboard selected
          p Select a dashboard from the left or create a new one to continue.
</template>

<script lang="ts" setup name="PersesDashboard">
  import { computed, ref } from 'vue'
  import { useStorage } from '@vueuse/core'
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/store'
  import PersesDashboardIframe from '@/perses-dashboard/vue/PersesDashboardIframe.vue'
  import type { PersesDashboardFile } from '@/perses-dashboard/react/WorkbenchProvider'

  type DashboardItem = {
    id: string
    name: string
    file: PersesDashboardFile
  }

  const { hideSidebar } = storeToRefs(useAppStore())
  const sidebarWidth = useStorage('perses-sidebar-width', 280)
  const searchText = ref('')

  const createEmptyDashboard = (name: string) => {
    const dashboardName = name.split('.')[0] || 'empty-dashboard'
    return {
      kind: 'Dashboard',
      metadata: {
        name: dashboardName,
        project: 'default',
        version: 0,
      },
      spec: {
        display: {
          name: dashboardName,
        },
        duration: '1h',
        refreshInterval: '30s',
        variables: [],
        layouts: [],
        panels: {},
      },
    }
  }

  const dashboards = ref<DashboardItem[]>([
    {
      id: 'sample-1',
      name: 'Sample Dashboard',
      file: {
        filename: 'sample-dashboard.json',
        content: JSON.stringify(createEmptyDashboard('sample-dashboard.json')),
        meta: {
          commit: {
            id: 'local',
          },
        },
      },
    },
  ])

  const selectedId = ref<string>(dashboards.value[0]?.id || '')

  const filteredDashboards = computed(() => {
    const keyword = searchText.value.trim().toLowerCase()
    if (!keyword) return dashboards.value
    return dashboards.value.filter((item) => item.name.toLowerCase().includes(keyword))
  })

  const selectedDashboard = computed(() => {
    return dashboards.value.find((item) => item.id === selectedId.value)
  })

  const actualSidebarWidth = computed(() => {
    const minWidth = 160
    const maxWidth = window.innerWidth * 0.4
    return Math.max(minWidth, Math.min(sidebarWidth.value, maxWidth))
  })

  const handleCreateDashboard = () => {
    const nextIndex = dashboards.value.length + 1
    const filename = `perses-dashboard-${nextIndex}.json`
    const newItem: DashboardItem = {
      id: `local-${Date.now()}`,
      name: `Perses Dashboard ${nextIndex}`,
      file: {
        filename,
        content: JSON.stringify(createEmptyDashboard(filename)),
        meta: {
          commit: {
            id: 'local',
          },
        },
      },
    }
    dashboards.value = [newItem, ...dashboards.value]
    selectedId.value = newItem.id
  }

  const handleSaveDashboard = async (payload: { dashboardJSON: unknown; name: string; commitId?: string }) => {
    const target = dashboards.value.find((item) => item.file.filename === payload.name)
    if (!target) return
    target.file = {
      ...target.file,
      content: JSON.stringify(payload.dashboardJSON),
      meta: {
        ...(target.file.meta || {}),
        commit: {
          ...(target.file.meta?.commit || {}),
          id: payload.commitId || target.file.meta?.commit?.id || 'local',
        },
      },
    }
  }
</script>

<style lang="less" scoped>
  .perses-sidebar {
    height: 100%;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .search-input {
    margin-bottom: 12px;
  }

  .list-item {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  :deep(.arco-list-item) {
    cursor: pointer;
    border-radius: 6px;
    padding: 6px 8px;
  }

  :deep(.arco-list-item.active),
  :deep(.arco-list-item:hover) {
    background: rgba(124, 58, 237, 0.1);
  }

  .perses-content {
    height: 100%;
  }

  .perses-content :deep(.perses-dashboard-iframe) {
    height: 100%;
    min-height: calc(100vh - 160px);
  }

  .empty-state {
    padding: 24px;
  }
</style>
