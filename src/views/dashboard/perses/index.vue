<template lang="pug">
a-layout.detail-layout.new-layout.new-layout--workspace(:class="{ 'is-sidebar-resizing': isSidebarResizing }")
  a-resize-box(
    v-model:width="sidebarWidth"
    :directions="['right']"
    :style="{ 'min-width': '160px', 'max-width': '40vw', 'flex-shrink': '0' }"
    @moving-start="onSidebarResizeStart"
    @moving-end="onSidebarResizeEnd"
  )
    a-layout-sider(style="height: 100%" :width="actualSidebarWidth")
      a-card.gpt-page-sidebar(:bordered="false")
        template(#title)
          a-space.space-between(fill style="width: 100%")
            | {{ $t('menu.dashboard.perses') }}
            a-button-group
              a-tooltip(
                v-if="skillAlertDismissed"
                mini
                position="bottom"
                :content="$t('dashboard.perses.skill.showEntry')"
              )
                a-button(type="text" size="small" @click="showSkillAlert")
                  template(#icon)
                    svg.icon-16
                      use(href="#question")
              a-tooltip(mini position="bottom" :content="$t('common.refresh')")
                a-button(type="text" size="small" @click="handleRefresh")
                  template(#icon)
                    svg.icon-16
                      use(href="#refresh")
              a-button(type="text" size="small" @click="openCreateModal")
                template(#icon)
                  svg.icon-16
                    use(href="#file-add")
        a-spin(:loading="isLoading")
          a-scrollbar.gpt-vertical-scrollbar
            a-empty(v-if="!filteredDashboards.length" :description="$t('dashboard.perses.emptySidebar')")
              template(#image)
                svg.icon-32
                  use(href="#empty")
            a-menu.gpt-sidebar-menu(v-model:selected-keys="selectedKeys" mode="vertical" :collapsed="false")
              a-menu-item(
                v-for="item in filteredDashboards"
                :key="item.id"
                type="text"
                long
              )
                template(#icon)
                  svg.icon-15
                    use(href="#details")
                span.gpt-sidebar-menu-text {{ item.name }}
                a-tooltip.menu-item-delete.gpt-sidebar-menu-action(
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
            .perses-skill-alert-wrap(v-if="!skillAlertDismissed")
              a-alert.perses-skill-alert(
                type="info"
                closable
                :show-icon="false"
                @close="dismissSkillAlert"
              )
                template(#title)
                  span {{ $t('dashboard.perses.skill.title') }}
                .perses-skill-alert__desc {{ $t('dashboard.perses.skill.desc') }}
                .perses-skill-alert__install
                  span.perses-skill-alert__label {{ $t('dashboard.perses.skill.installLabel') }}
                  a-typography-text.perses-skill-alert__command(
                    copyable
                    :copy-text="$t('dashboard.perses.skill.installCommand')"
                  ) {{ $t('dashboard.perses.skill.installCommand') }}
                .perses-skill-alert__link
                  a-link(target="_blank" rel="noopener noreferrer" :href="$t('dashboard.perses.skill.installUrl')")
                    | {{ $t('dashboard.perses.skill.installLinkText') }}
            .perses-skill-entry-wrap(v-else)
              a-link.perses-skill-entry(href="#" @click.prevent="showSkillAlert")
                | {{ $t('dashboard.perses.skill.showEntry') }}
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
          template(v-if="dashboards.length === 0")
            h3
              | {{ $t('dashboard.perses.emptyStateTitle') }}
            p
              | {{ $t('dashboard.perses.emptyStateDesc') }}
            a-space
              a-button(type="primary" @click="openCreateModal")
                | {{ $t('dashboard.perses.startCreate') }}
              a-button(
                type="secondary"
                target="_blank"
                rel="noopener noreferrer"
                :href="$t('dashboard.perses.learnMoreUrl')"
              )
                | {{ $t('dashboard.perses.learnMoreText') }}
          template(v-else)
            h3 No dashboard selected
            p Select a dashboard from the left or create a new one to continue.
    a-modal(
      v-model:visible="createModalVisible"
      title="New Dashboard"
      :ok-loading="isCreating"
      @ok="handleCreateDashboard"
      @cancel="handleCreateModalCancel"
    )
      a-form(layout="vertical" :model="createForm")
        a-form-item(label="Dashboard Name" field="name")
          a-input(
            v-model="createForm.name"
            placeholder="dashboard-name"
            allow-clear
            @press-enter="handleCreateDashboard"
          )
</template>

<script lang="ts" setup name="PersesDashboard">
  import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
  import { useStorage } from '@vueuse/core'
  import { storeToRefs } from 'pinia'
  import { Message } from '@arco-design/web-vue'
  import { IconDelete } from '@arco-design/web-vue/es/icon'
  import { useRoute, useRouter } from 'vue-router'
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
  const route = useRoute()
  const router = useRouter()
  const DASHBOARD_QUERY_KEY = 'dashboard'
  const sidebarWidthStorage = useStorage('perses-sidebar-width', 228)
  const skillAlertDismissed = useStorage('perses-skill-alert-dismissed', false)
  const isSidebarResizing = ref(false)

  const dismissSkillAlert = () => {
    skillAlertDismissed.value = true
  }

  const showSkillAlert = () => {
    skillAlertDismissed.value = false
  }

  const sidebarWidth = computed({
    get: () => {
      const width = Number(sidebarWidthStorage.value)
      return Number.isFinite(width) ? width : 228
    },
    set: (value: number) => {
      const minWidth = 160
      const maxWidth = window.innerWidth * 0.4
      const next = Number(value)
      sidebarWidthStorage.value = Math.max(minWidth, Math.min(Number.isFinite(next) ? next : 228, maxWidth))
    },
  })

  const actualSidebarWidth = computed(() => {
    const minWidth = 160
    const maxWidth = window.innerWidth * 0.4
    return Math.max(minWidth, Math.min(sidebarWidth.value, maxWidth))
  })
  const searchText = ref('')
  const createModalVisible = ref(false)
  const createForm = reactive({
    name: '',
  })
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

  const clampSidebarWidth = () => {
    if (sidebarWidth.value < 160) {
      sidebarWidth.value = 160
    }
  }

  watch(sidebarWidthStorage, clampSidebarWidth, { immediate: true })

  const onSidebarResizeEnd = () => {
    isSidebarResizing.value = false
    window.removeEventListener('mouseup', onSidebarResizeEnd)
    window.removeEventListener('blur', onSidebarResizeEnd)
    clampSidebarWidth()
  }

  const onSidebarResizeStart = () => {
    isSidebarResizing.value = true
    window.addEventListener('mouseup', onSidebarResizeEnd)
    window.addEventListener('blur', onSidebarResizeEnd)
  }

  onUnmounted(() => {
    onSidebarResizeEnd()
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
        definitionName || item.name || item.metadata?.name || definitionObj?.metadata?.name || `dashboard-${index + 1}`
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

  const applyQuerySelection = () => {
    const queryValue = route.query[DASHBOARD_QUERY_KEY]
    if (!queryValue || !dashboards.value.length) return

    const targetName = Array.isArray(queryValue) ? queryValue[0] : queryValue
    if (!targetName) return

    const target = dashboards.value.find((item) => item.name === targetName || item.file.filename === targetName)
    if (target) {
      selectedId.value = target.id
    }
  }

  const fetchDashboards = async () => {
    isLoading.value = true
    try {
      const res = await listDashboards()
      const items = normalizeDashboards(res)
      dashboards.value = items
      const selectedStillExists = !!selectedId.value && items.some((d) => d.id === selectedId.value)
      if (!selectedStillExists) {
        selectedId.value = ''
        if (items.length > 0) {
          applyQuerySelection()
          if (!selectedId.value) {
            selectedId.value = items[0].id
          }
        }
      }
    } catch (error) {
      Message.error('Failed to load dashboards')
    } finally {
      isLoading.value = false
    }
  }

  const handleRefresh = () => {
    fetchDashboards()
  }

  const openCreateModal = () => {
    createForm.name = ''
    createModalVisible.value = true
  }

  const handleCreateModalCancel = () => {
    createForm.name = ''
    createModalVisible.value = false
  }

  const buildDefaultDashboardName = () => {
    const nextIndex = dashboards.value.length + 1
    return `dashboard-${nextIndex}`
  }

  const handleCreateDashboard = async () => {
    if (isCreating.value) return
    const inputName = createForm.name.trim()
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
      createForm.name = ''
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

  watch(
    () => selectedId.value,
    (id) => {
      const query = { ...route.query }
      if (!id) {
        delete query[DASHBOARD_QUERY_KEY]
        router.replace({ query })
        return
      }
      const target = dashboards.value.find((item) => item.id === id)
      if (!target) return
      query[DASHBOARD_QUERY_KEY] = target.name
      router.replace({ query })
    }
  )

  onMounted(() => {
    fetchDashboards()
  })
</script>

<style lang="less" scoped>
  :deep(.arco-layout-sider-light) {
    box-shadow: none !important;
  }

  .new-layout {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    height: 100%;
    min-height: 0;

    :deep(> .arco-resizebox) {
      flex: 0 0 auto;
      height: 100%;
    }

    > .layout-content {
      flex: 1 1 0;
      min-width: 0;
      min-height: 0;
      height: 100%;
    }
  }

  .new-layout.is-sidebar-resizing > .layout-content,
  .new-layout.is-sidebar-resizing :deep(.perses-dashboard-iframe) {
    pointer-events: none;
    user-select: none;
  }

  .new-layout > .layout-content {
    overflow-y: hidden;
  }

  .perses-content {
    height: 100%;
  }
  .perses-content :deep(.arco-card-body) {
    height: 100%;
  }
  .perses-content :deep(.perses-dashboard-iframe) {
    height: 100%;
    min-height: calc(100vh - 160px);
  }

  .empty-state {
    padding: var(--gpt-page-padding-y) var(--gpt-page-padding-x);
    max-width: 760px;
    margin: 0 auto;
  }

  .empty-state h3 {
    margin: 0 0 12px;
    font-size: 20px;
    font-weight: 600;
  }

  .empty-state p {
    margin: 0 0 18px;
    color: var(--gpt-text-secondary);
    line-height: 1.6;
  }

  :deep(.delete-btn) {
    color: var(--gpt-brand-600);
  }

  .perses-skill-alert-wrap {
    box-sizing: border-box;
    padding: 12px 12px 0;
  }

  .perses-skill-entry-wrap {
    box-sizing: border-box;
    padding: 12px 12px 0;
  }

  .perses-skill-entry {
    display: block;
    font-size: 12px;
    line-height: 1.5;
  }

  .perses-skill-alert {
    position: relative;
    width: 100%;
    box-sizing: border-box;
    padding-right: 32px !important;
    font-size: 12px;
    line-height: 1.5;

    :deep(.arco-alert-body) {
      flex: 1;
      min-width: 0;
    }

    :deep(.arco-alert-content) {
      min-width: 0;
    }

    :deep(.arco-alert-title) {
      margin-bottom: 4px;
      padding-right: 8px;
    }

    :deep(.arco-alert-close-btn) {
      position: absolute;
      top: 10px;
      right: 10px;
      margin-left: 0;
    }
  }

  .perses-skill-alert__desc {
    margin-bottom: 8px;
    color: var(--gpt-text-secondary);
  }

  .perses-skill-alert__install {
    margin-bottom: 8px;
  }

  .perses-skill-alert__label {
    display: block;
    margin-bottom: 4px;
    font-weight: 500;
    color: var(--gpt-text-label);
  }

  .perses-skill-alert__command {
    display: block;
    max-width: 100%;
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.4;
    overflow-wrap: anywhere;

    :deep(.arco-typography) {
      max-width: 100%;
      overflow-wrap: anywhere;
    }
  }

  .perses-skill-alert__link {
    margin-top: 4px;

    :deep(.arco-link) {
      font-size: 12px;
    }
  }
</style>
