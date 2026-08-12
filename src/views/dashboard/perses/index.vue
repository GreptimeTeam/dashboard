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
            a-space(:size="4")
              span {{ $t('menu.dashboard.perses') }}
              a-tooltip(mini position="bottom" :content="$t('common.refresh')")
                a-button(type="text" size="small" @click="handleRefresh")
                  template(#icon)
                    svg.icon-16
                      use(href="#refresh")
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
              a-button(type="text" size="small" @click="openCreateModal")
                template(#icon)
                  svg.icon-16
                    use(href="#file-add")
        a-spin(:loading="isLoading")
          a-scrollbar.gpt-vertical-scrollbar
            a-empty(v-if="!hasSidebarDashboards" :description="$t('dashboard.perses.emptySidebar')")
              template(#image)
                svg.icon-32
                  use(href="#empty")
            a-menu.gpt-sidebar-menu(v-model:selected-keys="selectedKeys" mode="vertical" :collapsed="false")
              a-menu-item-group.gpt-sidebar-menu-category(v-if="groupedSidebarDashboards.live.length")
                template(#title)
                  span.gpt-sidebar-menu-category-text {{ $t('dashboard.perses.category.dashboard') }}
                a-menu-item(
                  v-for="item in groupedSidebarDashboards.live"
                  :key="item.id"
                  type="text"
                  long
                )
                  template(#icon)
                    svg.icon-15
                      use(href="#details")
                  .gpt-sidebar-menu-row
                    span.gpt-sidebar-menu-text {{ item.name }}
                    .gpt-sidebar-menu-actions(@click.stop)
                      DashboardSidebarMenu(
                        kind="live"
                        :is-selected="item.id === selectedId"
                        :dashboard-name="item.name"
                        @saveSnapshot="openSnapshotSaveModal(item)"
                        @exportSnapshotJson="handleExportSnapshotJsonFromLive(item)"
                        @delete="handleDeleteDashboard(item)"
                      )
              a-menu-item-group.gpt-sidebar-menu-category(v-if="groupedSidebarDashboards.snapshots.length")
                template(#title)
                  span.gpt-sidebar-menu-category-text {{ $t('dashboard.perses.category.snapshot') }}
                a-menu-item(
                  v-for="item in groupedSidebarDashboards.snapshots"
                  :key="item.id"
                  type="text"
                  long
                )
                  template(#icon)
                    svg.icon-15
                      use(href="#details")
                  .gpt-sidebar-menu-row
                    span.gpt-sidebar-menu-text {{ item.name }}
                    .gpt-sidebar-menu-actions(@click.stop)
                      DashboardSidebarMenu(
                        kind="snapshot"
                        :is-selected="item.id === selectedId"
                        :dashboard-name="item.name"
                        @exportSnapshotJson="handleExportSnapshot(item)"
                        @delete="handleDeleteDashboard(item)"
                      )
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
          ref="persesIframeRef"
          :name="selectedDashboard.file.filename"
          :file="selectedDashboard.file"
          :dashboard-editable="!isSelectedSnapshot"
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
      :title="$t('dashboard.perses.createModalTitle')"
      :ok-loading="isCreating"
      @ok="handleCreateDashboard"
      @cancel="handleCreateModalCancel"
    )
      a-form(layout="vertical" :model="createForm")
        a-form-item(field="mode")
          a-radio-group(v-model="createForm.mode" type="button")
            a-radio(value="blank") {{ $t('dashboard.perses.createModeBlank') }}
            a-radio(value="import") {{ $t('dashboard.perses.createModeImport') }}
        a-form-item(field="name" :label="$t('dashboard.perses.createNameLabel')")
          a-input(
            v-model="createForm.name"
            allow-clear
            :placeholder="$t('dashboard.perses.createNamePlaceholder')"
            @press-enter="handleCreateDashboard"
          )
        template(v-if="createForm.mode === 'import'")
          a-form-item(field="json" :label="$t('dashboard.perses.importJsonLabel')")
            a-textarea(
              v-model="createForm.json"
              :placeholder="$t('dashboard.perses.importJsonPlaceholder')"
              :auto-size="{ minRows: 8, maxRows: 16 }"
            )
          a-form-item
            a-upload(
              accept=".json,application/json"
              :show-file-list="false"
              :auto-upload="false"
              @before-upload="handleImportFileBeforeUpload"
            )
              template(#upload-button)
                a-button(type="outline") {{ $t('dashboard.perses.importUpload') }}
          a-alert(v-if="importPreview?.ok" type="info" style="margin-bottom: 8px")
            | {{ $t('dashboard.perses.importSummary', importSummaryParams) }}
          a-alert(
            v-for="(warning, index) in importPreviewWarnings"
            :key="`import-warning-${index}`"
            type="warning"
            style="margin-bottom: 8px"
          )
            | {{ warning }}
          a-alert(
            v-for="(error, index) in importPreviewErrors"
            :key="`import-error-${index}`"
            type="error"
            style="margin-bottom: 8px"
          )
            | {{ error }}
    a-modal(
      v-model:visible="snapshotModalVisible"
      :title="$t('dashboard.perses.snapshotModalTitle')"
      :ok-text="$t('dashboard.perses.snapshotModalOkSave')"
      :ok-loading="isSavingSnapshot"
      @ok="handleSnapshotModalConfirm"
      @cancel="handleSnapshotModalCancel"
    )
      a-alert(type="warning" style="margin-bottom: 16px")
        | {{ $t('dashboard.perses.snapshotModalHint') }}
      a-form(layout="vertical" :model="snapshotForm")
        a-form-item(field="name" :label="$t('dashboard.perses.snapshotNameLabel')")
          a-input(
            v-model="snapshotForm.name"
            allow-clear
            :placeholder="$t('dashboard.perses.snapshotNamePlaceholder')"
            @press-enter="handleSnapshotModalConfirm"
          )
</template>

<script lang="ts" setup name="PersesDashboard">
  import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
  import { useStorage } from '@vueuse/core'
  import { storeToRefs } from 'pinia'
  import { Message } from '@arco-design/web-vue'
  import { useRoute, useRouter } from 'vue-router'
  import { useAppStore } from '@/store'
  import PersesDashboardIframe from '@/perses-dashboard/vue/PersesDashboardIframe.vue'
  import type { PersesDashboardFile } from '@/perses-dashboard/react/WorkbenchProvider'
  import {
    getDashboardCategoryFromContent,
    DASHBOARD_CATEGORY_SNAPSHOT,
    annotateDashboardCategory,
    isSnapshotDashboardContent,
  } from '@/perses-dashboard/snapshot/isSnapshotDashboardContent'
  import {
    parseDashboardImport,
    type ImportParseErrorCode,
    type ImportParseWarningCode,
  } from '@/perses-dashboard/snapshot/parseDashboardImport'
  import downloadDashboardJson from '@/perses-dashboard/snapshot/exportSnapshotJson'
  import { deleteDashboard, listDashboards, saveDashboard } from '@/api/dashboards'
  import { useI18n } from 'vue-i18n'
  import DashboardSidebarMenu from './components/DashboardSidebarMenu.vue'

  type DashboardItem = {
    id: string
    name: string
    file: PersesDashboardFile
  }

  const { hideSidebar } = storeToRefs(useAppStore())
  const { t } = useI18n()
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
    mode: 'blank' as 'blank' | 'import',
    name: '',
    json: '',
  })
  const snapshotForm = reactive({
    name: '',
  })
  const isCreating = ref(false)
  const isSavingSnapshot = ref(false)
  const snapshotModalVisible = ref(false)
  const persesIframeRef = ref<InstanceType<typeof PersesDashboardIframe> | null>(null)

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

  const groupedSidebarDashboards = computed(() => {
    const keyword = searchText.value.trim().toLowerCase()
    const match = (item: DashboardItem) => !keyword || item.name.toLowerCase().includes(keyword)
    const live: DashboardItem[] = []
    const snapshots: DashboardItem[] = []

    dashboards.value.forEach((item) => {
      if (!match(item)) return
      if (getDashboardCategoryFromContent(item.file.content) === DASHBOARD_CATEGORY_SNAPSHOT) {
        snapshots.push(item)
      } else {
        live.push(item)
      }
    })

    return { live, snapshots }
  })

  const hasSidebarDashboards = computed(() => {
    const { live, snapshots } = groupedSidebarDashboards.value
    return live.length > 0 || snapshots.length > 0
  })

  const selectedDashboard = computed(() => {
    return dashboards.value.find((item) => item.id === selectedId.value)
  })

  const isSelectedSnapshot = computed(() => {
    return isSnapshotDashboardContent(selectedDashboard.value?.file?.content)
  })

  const buildDefaultSnapshotName = (sourceName: string) => {
    const base = sourceName.endsWith('.json') ? sourceName.slice(0, -5) : sourceName
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    return `${base}-snapshot-${stamp}`
  }

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

  const persistDashboard = async (dashboardJSON: Record<string, unknown>, saveName: string) => {
    const filename = saveName.endsWith('.json') ? saveName : `${saveName}.json`
    const apiName = saveName.endsWith('.json') ? saveName.slice(0, -5) : saveName
    await saveDashboard(apiName, { content: JSON.stringify(dashboardJSON) })
    const newItem: DashboardItem = {
      id: `remote-${Date.now()}`,
      name: saveName,
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
    return newItem
  }

  const resolveSnapshotSaveName = (dashboardJSON: Record<string, unknown>, fallbackName: string) => {
    const definitionName = getDashboardNameFromDefinition(dashboardJSON) || fallbackName
    return definitionName.endsWith('.json') ? definitionName.slice(0, -5) : definitionName
  }

  const openSnapshotSaveModal = (item: DashboardItem) => {
    if (item.id !== selectedId.value || isSnapshotDashboardContent(item.file.content)) return
    snapshotForm.name = buildDefaultSnapshotName(item.name)
    snapshotModalVisible.value = true
  }

  const handleSnapshotModalCancel = () => {
    snapshotForm.name = ''
    snapshotModalVisible.value = false
  }

  const handleSnapshotModalConfirm = async () => {
    const item = selectedDashboard.value
    if (!item || isSavingSnapshot.value) return
    if (!persesIframeRef.value?.requestCreateSnapshot) {
      Message.error(t('dashboard.perses.snapshotCreateFailed'))
      return
    }

    try {
      isSavingSnapshot.value = true
      const result = await persesIframeRef.value.requestCreateSnapshot(snapshotForm.name.trim())
      const dashboardJSON = result.dashboard as Record<string, any>

      // eslint-disable-next-line no-console
      console.group('[snapshot-export] parent received snapshot')
      // eslint-disable-next-line no-console
      console.log('snapshot data JSON:', JSON.stringify(dashboardJSON?.spec?.snapshot, null, 2))
      // eslint-disable-next-line no-console
      console.log('skipped:', result.skipped)
      // eslint-disable-next-line no-console
      console.log('debug:', (result as { debug?: unknown }).debug)
      // eslint-disable-next-line no-console
      console.groupEnd()

      const saveName = resolveSnapshotSaveName(
        dashboardJSON,
        snapshotForm.name.trim() || buildDefaultSnapshotName(item.name)
      )
      const skippedCount = result.skipped?.length ?? 0

      await persistDashboard(dashboardJSON, saveName)
      snapshotModalVisible.value = false
      snapshotForm.name = ''

      if (skippedCount > 0) {
        Message.warning(t('dashboard.perses.snapshotSavedWithSkipped', { count: skippedCount }))
      } else {
        Message.success(t('dashboard.perses.snapshotSaved'))
      }
    } catch {
      Message.error(t('dashboard.perses.snapshotCreateFailed'))
    } finally {
      isSavingSnapshot.value = false
    }
  }

  const handleExportSnapshotJsonFromLive = async (item: DashboardItem) => {
    if (item.id !== selectedId.value) return
    if (!persesIframeRef.value?.requestCreateSnapshot) {
      Message.error(t('dashboard.perses.snapshotExportFailed'))
      return
    }

    try {
      isSavingSnapshot.value = true
      const defaultName = buildDefaultSnapshotName(item.name)
      const result = await persesIframeRef.value.requestCreateSnapshot(defaultName)
      const dashboardJSON = result.dashboard as Record<string, unknown>
      const saveName = resolveSnapshotSaveName(dashboardJSON, defaultName)
      const skippedCount = result.skipped?.length ?? 0

      downloadDashboardJson(JSON.stringify(dashboardJSON), saveName)

      if (skippedCount > 0) {
        Message.warning(t('dashboard.perses.snapshotExportedWithSkipped', { count: skippedCount }))
      } else {
        Message.success(t('dashboard.perses.snapshotExported'))
      }
    } catch {
      Message.error(t('dashboard.perses.snapshotExportFailed'))
    } finally {
      isSavingSnapshot.value = false
    }
  }

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

  const buildDefaultDashboardName = () => {
    const nextIndex = dashboards.value.length + 1
    return `dashboard-${nextIndex}`
  }

  const mapImportError = (code: ImportParseErrorCode) => {
    const keyMap: Record<ImportParseErrorCode, string> = {
      invalid_json: 'dashboard.perses.importErrorInvalidJson',
      invalid_kind: 'dashboard.perses.importErrorInvalidKind',
      missing_spec: 'dashboard.perses.importErrorMissingSpec',
      missing_name: 'dashboard.perses.importErrorMissingName',
      embedded_without_snapshot: 'dashboard.perses.importErrorEmbeddedWithoutSnapshot',
    }
    return t(keyMap[code])
  }

  const mapImportWarning = (code: ImportParseWarningCode) => {
    const keyMap: Record<ImportParseWarningCode, string> = {
      empty_panel_data: 'dashboard.perses.importWarningEmptyPanelData',
      skipped_panel_data: 'dashboard.perses.importWarningSkippedPanelData',
    }
    return t(keyMap[code])
  }

  const importPreview = computed(() => {
    if (createForm.mode !== 'import' || !createForm.json.trim()) {
      return null
    }
    return parseDashboardImport(createForm.json, {
      nameOverride: createForm.name,
      defaultName: buildDefaultDashboardName(),
    })
  })

  const importPreviewErrors = computed(() => {
    const preview = importPreview.value
    if (!preview || preview.ok !== false) return []
    return preview.errors.map((code) => mapImportError(code))
  })

  const importPreviewWarnings = computed(() => {
    if (!importPreview.value?.ok) return []
    return importPreview.value.warnings.map((code) => mapImportWarning(code))
  })

  const importSummaryParams = computed(() => {
    if (!importPreview.value?.ok) {
      return { type: '', count: 0 }
    }
    const typeKey =
      importPreview.value.category === DASHBOARD_CATEGORY_SNAPSHOT
        ? 'dashboard.perses.importTypeSnapshot'
        : 'dashboard.perses.importTypeDashboard'
    return {
      type: t(typeKey),
      count: importPreview.value.panelCount,
    }
  })

  const resetCreateForm = () => {
    createForm.mode = 'blank'
    createForm.name = ''
    createForm.json = ''
  }

  const handleImportFileBeforeUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      createForm.json = String(event.target?.result ?? '')
    }
    reader.readAsText(file)
    return false
  }

  const openCreateModal = () => {
    resetCreateForm()
    createModalVisible.value = true
  }

  // Deep-link: ?create=1 opens create modal
  watch(
    () => route.query.create,
    (val) => {
      if (val === '1') {
        openCreateModal()
        useRouter().replace({ query: { ...route.query, create: undefined } })
      }
    },
    { immediate: true }
  )

  const handleCreateModalCancel = () => {
    resetCreateForm()
    createModalVisible.value = false
  }

  const handleCreateDashboard = async () => {
    if (isCreating.value) return

    if (createForm.mode === 'import') {
      if (!createForm.json.trim()) {
        Message.error(t('dashboard.perses.importErrorInvalidJson'))
        return
      }

      const parsed = parseDashboardImport(createForm.json, {
        nameOverride: createForm.name,
        defaultName: buildDefaultDashboardName(),
      })

      if (parsed.ok === false) {
        Message.error(parsed.errors.map((code) => mapImportError(code)).join('; '))
        return
      }

      const saveName =
        getDashboardNameFromDefinition(parsed.dashboard) || createForm.name.trim() || buildDefaultDashboardName()

      try {
        isCreating.value = true
        await persistDashboard(parsed.dashboard as unknown as Record<string, unknown>, saveName)
        createModalVisible.value = false
        resetCreateForm()
        if (parsed.category === DASHBOARD_CATEGORY_SNAPSHOT) {
          Message.success(t('dashboard.perses.snapshotSaved'))
        } else {
          Message.success(t('dashboard.perses.dashboardImported'))
        }
      } catch (error) {
        Message.error(t('dashboard.perses.importFailed'))
      } finally {
        isCreating.value = false
      }
      return
    }

    const inputName = createForm.name.trim()
    const name = inputName || buildDefaultDashboardName()
    const dashboardJSON = createEmptyDashboard(name)
    try {
      isCreating.value = true
      await persistDashboard(dashboardJSON, name)
      createModalVisible.value = false
      resetCreateForm()
      Message.success(t('dashboard.perses.dashboardCreated'))
    } catch (error) {
      Message.error(t('dashboard.perses.createFailed'))
    } finally {
      isCreating.value = false
    }
  }

  const handleExportSnapshot = (item: DashboardItem) => {
    try {
      downloadDashboardJson(item.file.content, item.name)
      Message.success(t('dashboard.perses.snapshotExported'))
    } catch {
      Message.error(t('dashboard.perses.snapshotExportFailed'))
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

    const wasLiveBefore = !isSnapshotDashboardContent(target.file.content)
    let dashboardJSON = payload.dashboardJSON as Record<string, unknown>
    const isSnapshot = isSnapshotDashboardContent(JSON.stringify(dashboardJSON))

    if (isSnapshot) {
      dashboardJSON = annotateDashboardCategory(dashboardJSON, DASHBOARD_CATEGORY_SNAPSHOT) as Record<string, unknown>
    }

    const definitionName = getDashboardNameFromDefinition(dashboardJSON)
    const resolvedName = definitionName || target.name
    const saveName = resolvedName.endsWith('.json') ? resolvedName.slice(0, -5) : resolvedName
    try {
      await saveDashboard(saveName, { content: JSON.stringify(dashboardJSON) })
      target.name = resolvedName
      target.file = {
        ...target.file,
        filename: resolvedName.endsWith('.json') ? resolvedName : `${resolvedName}.json`,
        content: JSON.stringify(dashboardJSON),
        meta: {
          ...(target.file.meta || {}),
          commit: {
            ...(target.file.meta?.commit || {}),
            id: payload.commitId || target.file.meta?.commit?.id || 'remote',
          },
        },
      }
      if (isSnapshot) {
        if (wasLiveBefore) {
          Message.warning(t('dashboard.perses.saveAsSnapshotHint'))
        }
        Message.success(t('dashboard.perses.snapshotSaved'))
      } else {
        Message.success(t('dashboard.perses.dashboardSaved'))
      }
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

  :deep(.gpt-sidebar-menu-row .rotate-90) {
    transform: rotate(90deg);
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

  .perses-skill-alert__link {
    margin-top: 4px;

    :deep(.arco-link) {
      font-size: 12px;
    }
  }
</style>
