<template lang="pug">
a-layout.detail-layout.new-layout
  a-layout-sider(:resize-directions="['right']" :width="actualSidebarWidth")
    a-card.perses-sidebar(:bordered="false")
      template(#title)
        a-space.space-between(fill style="width: 100%")
          | {{ $t('menu.dashboard.perses') }}
          a-button-group
            a-button(type="text" size="small" @click="openCreateModal")
              template(#icon)
                svg.icon-16
                  use(href="#file-add")
      a-spin(:loading="isLoading")
        a-scrollbar
          a-empty(v-if="!filteredDashboards.length")
            template(#image)
              svg.icon-32
                use(href="#empty")
          a-menu(v-model:selected-keys="selectedKeys")
            a-menu-item(
              v-for="item in filteredDashboards"
              :key="item.id"
              type="text"
              long
              style="margin-bottom: 0"
            )
              .menu-item
                span.name {{ item.name }}
                a-tooltip.menu-item-delete(
                  v-if="item.id === selectedId"
                  mini
                  position="left"
                  content="Delete"
                )
                  a-popconfirm(
                    content="Are you sure to delete this dashboard?"
                    type="warning"
                    @ok="handleDeleteDashboard(item)"
                  )
                    IconDelete.delete-btn
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
    a-modal(
      v-model:visible="createModalVisible"
      title="New Dashboard"
      :ok-loading="isCreating"
      @ok="handleCreateDashboard"
      @cancel="handleCreateModalCancel"
    )
      a-form(layout="vertical")
        a-form-item(label="Dashboard Name")
          a-input(
            v-model="newDashboardName"
            placeholder="dashboard-name"
            allow-clear
            @press-enter="handleCreateDashboard"
          )
</template>

<script lang="ts" setup name="PersesDashboard">
  import { computed, onMounted, ref } from 'vue'
  import { useStorage } from '@vueuse/core'
  import { storeToRefs } from 'pinia'
  import { Message } from '@arco-design/web-vue'
  import { IconDelete } from '@arco-design/web-vue/es/icon'
  import { useAppStore } from '@/store'
  import PersesDashboardIframe from '@/perses-dashboard/vue/PersesDashboardIframe.vue'
  import type { PersesDashboardFile } from '@/perses-dashboard/react/WorkbenchProvider'
  import { deleteDashboard, listDashboards, saveDashboard } from '@/api/dashboards'

  type DashboardItem = {
    id: string
    name: string
    file: PersesDashboardFile
  }

  const { hideSidebar } = storeToRefs(useAppStore())
  const sidebarWidth = useStorage('perses-sidebar-width', 280)
  const searchText = ref('')
  const createModalVisible = ref(false)
  const newDashboardName = ref('')
  const isCreating = ref(false)

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

  const dashboards = ref<DashboardItem[]>([])
  const isLoading = ref(false)

  const selectedId = ref<string>('')
  const selectedKeys = computed({
    get: () => (selectedId.value ? [selectedId.value] : []),
    set: (keys: string[]) => {
      selectedId.value = keys?.[0] || ''
    },
  })

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

  const getDashboardNameFromDefinition = (definition: unknown): string | null => {
    if (!definition) return null
    if (typeof definition === 'string') {
      try {
        return getDashboardNameFromDefinition(JSON.parse(definition))
      } catch {
        return null
      }
    }
    if (typeof definition !== 'object') return null
    const defObj = definition as any
    if (typeof defObj?.metadata?.name === 'string') {
      const name = defObj.metadata.name.trim()
      return name || null
    }
    if (typeof defObj?.spec?.display?.name === 'string') {
      const name = defObj.spec.display.name.trim()
      return name || null
    }
    if (typeof defObj?.content === 'string') {
      try {
        return getDashboardNameFromDefinition(JSON.parse(defObj.content))
      } catch {
        return null
      }
    }
    return null
  }

  const normalizeDashboards = (raw: any): DashboardItem[] => {
    const list = raw?.dashboards ?? raw?.items ?? raw?.data ?? raw?.output ?? raw ?? []
    if (!Array.isArray(list)) return []

    return list.map((item: any, index: number) => {
      const definition = item?.definition
      let definitionObj: any = null
      if (definition && typeof definition === 'string') {
        try {
          definitionObj = JSON.parse(definition)
        } catch {
          definitionObj = null
        }
      } else if (definition && typeof definition === 'object') {
        definitionObj = definition
      }

      let definitionContent: string | null = null
      if (definitionObj?.content && typeof definitionObj.content === 'string') {
        definitionContent = definitionObj.content
      } else if (definitionObj && typeof definitionObj === 'object') {
        definitionContent = JSON.stringify(definitionObj)
      }

      if (typeof item === 'string') {
        const filename = item.endsWith('.json') ? item : `${item}.json`
        return {
          id: `remote-${index}-${item}`,
          name: item,
          file: {
            filename,
            content: JSON.stringify(createEmptyDashboard(filename)),
            meta: {
              commit: {
                id: 'remote',
              },
            },
          },
        }
      }

      const definitionName = getDashboardNameFromDefinition(definitionObj)
      const name =
        item.name || item.metadata?.name || definitionName || definitionObj?.metadata?.name || `dashboard-${index + 1}`
      const filename = name.endsWith('.json') ? name : `${name}.json`
      const content =
        item.content || definitionContent || (item.dashboardJSON ? JSON.stringify(item.dashboardJSON) : '')
      const fallbackContent = item.spec ? JSON.stringify(item) : ''
      return {
        id: `remote-${index}-${name}`,
        name,
        file: {
          filename,
          content: content || fallbackContent || JSON.stringify(createEmptyDashboard(filename)),
          meta: {
            commit: {
              id: item.commitId || 'remote',
            },
          },
        },
      }
    })
  }

  const fetchDashboards = async () => {
    isLoading.value = true
    try {
      const res = await listDashboards()
      const items = normalizeDashboards(res)
      dashboards.value = items
      if (items.length > 0 && !selectedId.value) {
        selectedId.value = items[0].id
      }
    } catch (error) {
      Message.error('Failed to load dashboards')
    } finally {
      isLoading.value = false
    }
  }

  const openCreateModal = () => {
    newDashboardName.value = ''
    createModalVisible.value = true
  }

  const handleCreateModalCancel = () => {
    createModalVisible.value = false
  }

  const buildDefaultDashboardName = () => {
    const nextIndex = dashboards.value.length + 1
    return `dashboard-${nextIndex}`
  }

  const handleCreateDashboard = async () => {
    if (isCreating.value) return
    const inputName = newDashboardName.value.trim()
    const name = inputName || buildDefaultDashboardName()
    const filename = `${name}.json`
    const dashboardJSON = createEmptyDashboard(filename)
    const apiName = name.endsWith('.json') ? name.slice(0, -5) : name
    try {
      isCreating.value = true
      await saveDashboard(apiName, { content: JSON.stringify(dashboardJSON) })
      const newItem: DashboardItem = {
        id: `remote-${Date.now()}`,
        name,
        file: {
          filename,
          content: JSON.stringify(dashboardJSON),
          meta: {
            commit: {
              id: 'remote',
            },
          },
        },
      }
      dashboards.value = [newItem, ...dashboards.value]
      selectedId.value = newItem.id
      createModalVisible.value = false
      newDashboardName.value = ''
      Message.success('Dashboard created')
    } catch (error) {
      Message.error('Failed to create dashboard')
    } finally {
      isCreating.value = false
    }
  }

  const handleDeleteDashboard = async (item?: DashboardItem) => {
    const target = item || selectedDashboard.value
    if (!target) return
    try {
      const apiName = target.name.endsWith('.json') ? target.name.slice(0, -5) : target.name
      await deleteDashboard(apiName)
      dashboards.value = dashboards.value.filter((d) => d.id !== target.id)
      selectedId.value = dashboards.value[0]?.id || ''
      Message.success('Dashboard deleted')
    } catch (error) {
      Message.error('Failed to delete dashboard')
    }
  }

  const handleSaveDashboard = async (payload: { dashboardJSON: unknown; name: string; commitId?: string }) => {
    const target = dashboards.value.find((item) => item.file.filename === payload.name)
    if (!target) return
    const definitionName = getDashboardNameFromDefinition(payload.dashboardJSON)
    const resolvedName = definitionName || target.name
    const saveName = resolvedName.endsWith('.json') ? resolvedName.slice(0, -5) : resolvedName
    try {
      await saveDashboard(saveName, { content: JSON.stringify(payload.dashboardJSON) })
      target.name = resolvedName
      target.file = {
        ...target.file,
        filename: resolvedName.endsWith('.json') ? resolvedName : `${resolvedName}.json`,
        content: JSON.stringify(payload.dashboardJSON),
        meta: {
          ...(target.file.meta || {}),
          commit: {
            ...(target.file.meta?.commit || {}),
            id: payload.commitId || target.file.meta?.commit?.id || 'remote',
          },
        },
      }
      Message.success('Dashboard saved')
    } catch (error) {
      Message.error('Failed to save dashboard')
    }
  }

  onMounted(() => {
    fetchDashboards()
  })
</script>

<style lang="less" scoped>
  .perses-sidebar {
    height: 100%;
  }

  .search-input {
    margin-bottom: 12px;
  }

  .perses-sidebar :deep(.arco-card-body) {
    display: flex;
    flex-direction: column;
  }

  .perses-sidebar :deep(.arco-scrollbar) {
    flex: 1;
    min-height: 0;
  }

  .perses-content :deep(.perses-dashboard-iframe) {
    height: 100%;
    min-height: calc(100vh - 160px);
  }

  .empty-state {
    padding: 24px;
  }

  :deep(.arco-menu-vertical .arco-menu-inner) {
    padding: 0;
  }

  :deep(.arco-menu-light .arco-menu-item.arco-menu-selected) {
    color: var(--brand-color);
  }

  .menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .menu-item .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.delete-btn) {
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  :deep(.arco-menu-item:hover) .delete-btn,
  :deep(.arco-menu-item.arco-menu-selected) .delete-btn {
    opacity: 1;
  }
</style>
