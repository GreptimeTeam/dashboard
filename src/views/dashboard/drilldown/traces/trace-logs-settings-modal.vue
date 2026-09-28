<template lang="pug">
a-modal.trace-logs-settings(
  unmount-on-close
  :visible="visible"
  :title="t('drilldown.traces.logsSettingsTitle')"
  :width="720"
  :ok-text="t('drilldown.logs.settingsSave')"
  :cancel-text="t('drilldown.logs.settingsCancel')"
  @ok="save"
  @cancel="close"
  @update:visible="emit('update:visible', $event)"
)
  p.trace-logs-settings__intro
    | {{ t('drilldown.traces.logsSettingsDescription') }}

  a-alert.trace-logs-settings__hint(type="info" show-icon)
    | {{ t('drilldown.traces.logsSettingsModelHint') }}

  a-form(layout="vertical" @submit.prevent)
    .trace-logs-settings__row(v-for="(mapping, index) in mappings" :key="index")
      a-form-item(:label="t('drilldown.traces.logsSettingsService')")
        a-select.trace-logs-settings__input(
          v-model="mapping.service"
          allow-search
          allow-create
          :placeholder="t('drilldown.traces.logsSettingsServicePlaceholder')"
        )
          a-option(v-for="service in serviceOptions" :key="service" :value="service") {{ service }}

      a-form-item(:label="t('drilldown.logs.databaseLabel')")
        a-select.trace-logs-settings__input(
          v-model="mapping.database"
          allow-search
          :options="databaseOptions"
          :placeholder="t('dashboard.database')"
          @popup-visible-change="onDatabasePopup"
          @change="onDatabaseChange(index)"
        )

      a-form-item(:label="t('drilldown.logs.tableLabel')")
        a-select.trace-logs-settings__input(
          v-model="mapping.table"
          allow-search
          allow-create
          :loading="loadingTables[index]"
          :placeholder="t('drilldown.logs.tablePlaceholder')"
          @change="onTableChange(index)"
        )
          a-option(v-for="table in tableOptions[index]" :key="table" :value="table") {{ table }}

      a-button.trace-logs-settings__remove(
        type="text"
        status="danger"
        size="small"
        @click="removeMapping(index)"
      ) {{ t('drilldown.traces.logsSettingsRemove') }}

      a-alert.trace-logs-settings__warning(v-if="nonModelTables[index]" type="warning" show-icon)
        | {{ t('drilldown.traces.nonModelTableHint') }}

  a-button.trace-logs-settings__add(type="dashed" long @click="addMapping") {{ t('drilldown.traces.logsSettingsAdd') }}
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/store'
  import { useDrilldownContext } from '@/observability/context'
  import {
    loadDrilldownSettings,
    updateTracesDrilldownSettings,
    type TraceLogsMapping,
  } from '@/observability/drilldown-settings'
  import { listSignalTables } from '@/observability/semantics'
  import useTableSchemaStore from '@/store/modules/table-schema'

  const props = defineProps<{
    visible: boolean
    services?: string[]
  }>()

  const emit = defineEmits<{
    'update:visible': [visible: boolean]
    'saved': [mappings: TraceLogsMapping[]]
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const appStore = useAppStore()
  const { databaseList } = storeToRefs(appStore)
  const tableSchemaStore = useTableSchemaStore()

  const mappings = ref<TraceLogsMapping[]>([])
  const tableOptions = ref<Record<number, string[]>>({})
  const loadingTables = ref<Record<number, boolean>>({})
  const nonModelTables = ref<Record<number, boolean>>({})

  const databaseOptions = computed(() => {
    const current = ctx.logsDatabase.value
    const names = databaseList.value.length ? [...databaseList.value] : []
    if (current && !names.includes(current)) {
      names.unshift(current)
    }
    return names.map((name) => ({ label: name, value: name }))
  })
  const serviceOptions = computed(() => [...new Set(props.services ?? [])].filter(Boolean).sort())

  async function loadTableOptions(index: number) {
    const database = mappings.value[index]?.database || ctx.logsDatabase.value
    if (!database) {
      tableOptions.value[index] = []
      return
    }
    loadingTables.value[index] = true
    try {
      tableOptions.value[index] = await listSignalTables('logs', {
        database,
        include: mappings.value[index]?.table ? [mappings.value[index].table] : [],
      })
    } catch (error) {
      console.error('Failed to load trace logs table options', error)
      tableOptions.value[index] = []
    } finally {
      loadingTables.value[index] = false
    }
  }

  async function validateTableModel(index: number) {
    const mapping = mappings.value[index]
    nonModelTables.value[index] = false
    if (!mapping?.table) {
      return
    }
    try {
      const columns = await tableSchemaStore.ensureTableSchema(mapping.table, mapping.database)
      nonModelTables.value[index] = !columns.some((column) => column.name === 'trace_id')
    } catch {
      // Schema discovery may be unavailable. The Logs page remains the source of truth.
      nonModelTables.value[index] = false
    }
  }

  function hydrate() {
    const saved = loadDrilldownSettings(ctx.tracesDatabase.value).traces.traceLogsMappings ?? []
    mappings.value = saved.map((mapping) => ({ ...mapping }))
    tableOptions.value = {}
    loadingTables.value = {}
    nonModelTables.value = {}
    mappings.value.forEach((_, index) => {
      loadTableOptions(index)
    })
  }

  function addMapping() {
    const used = new Set(mappings.value.map((mapping) => mapping.service))
    const service = (props.services ?? []).find((item) => item && !used.has(item)) || ''
    mappings.value.push({
      service,
      database: ctx.logsDatabase.value,
      table: '',
    })
    const index = mappings.value.length - 1
    loadTableOptions(index)
  }

  function removeMapping(index: number) {
    mappings.value.splice(index, 1)
  }

  function onDatabaseChange(index: number) {
    mappings.value[index].table = ''
    tableOptions.value[index] = []
    nonModelTables.value[index] = false
    loadTableOptions(index)
  }

  function onTableChange(index: number) {
    validateTableModel(index)
  }

  function onDatabasePopup(visible: boolean) {
    if (visible && databaseList.value.length === 0) {
      appStore.refreshDatabaseList()
    }
  }

  function close() {
    emit('update:visible', false)
  }

  function save() {
    const next = mappings.value
      .map((mapping) => ({
        service: mapping.service.trim(),
        database: mapping.database.trim(),
        table: mapping.table.trim(),
      }))
      .filter((mapping, index, all) => {
        return (
          mapping.service &&
          mapping.database &&
          mapping.table &&
          all.findIndex((item) => item.service === mapping.service) === index
        )
      })
    updateTracesDrilldownSettings({ traceLogsMappings: next }, ctx.tracesDatabase.value)
    emit('saved', next)
    emit('update:visible', false)
  }

  watch(
    () => props.visible,
    (visible) => {
      if (visible) {
        hydrate()
      }
    },
    { immediate: true }
  )
</script>

<style scoped lang="less">
  .trace-logs-settings__intro {
    margin-bottom: var(--gpt-gap-md);
    color: var(--gpt-text-secondary);
  }

  .trace-logs-settings__hint {
    margin-bottom: var(--gpt-gap-lg);
  }

  .trace-logs-settings__row {
    display: grid;
    grid-template-columns: minmax(140px, 1fr) minmax(140px, 1fr) minmax(180px, 1.2fr) auto;
    gap: var(--gpt-gap-sm);
    align-items: end;
    margin-bottom: var(--gpt-gap-sm);
    padding: var(--gpt-gap-sm);
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-md);
  }

  .trace-logs-settings__row :deep(.arco-form-item) {
    margin-bottom: 0;
  }

  .trace-logs-settings__input {
    width: 100%;
  }

  .trace-logs-settings__warning {
    grid-column: 1 / -1;
  }

  .trace-logs-settings__add {
    margin-top: var(--gpt-gap-md);
  }
</style>
