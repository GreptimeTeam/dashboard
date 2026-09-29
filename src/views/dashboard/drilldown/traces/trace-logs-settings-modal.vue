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

  p.trace-logs-settings__fallback(v-if="fallbackTable")
    | {{ t('drilldown.traces.logsMappingFallbackHint', { table: fallbackTable }) }}

  a-form.trace-logs-settings__form(
    v-if="mappings.length"
    layout="horizontal"
    :auto-label-width="true"
    @submit.prevent
  )
    .trace-logs-settings__row(v-for="(mapping, index) in mappings" :key="index")
      .trace-logs-settings__service-line
        span.trace-logs-settings__service-label {{ t('drilldown.traces.logsSettingsService') }}
        span.trace-logs-settings__service {{ mapping.service }}

      .trace-logs-settings__pair
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
            allow-clear
            :loading="loadingTables[index]"
            :placeholder="t('drilldown.logs.tablePlaceholder')"
            @change="onTableChange(index)"
          )
            a-option(v-for="table in tableOptions[index]" :key="table" :value="table") {{ table }}

      a-alert.trace-logs-settings__warning(v-if="nonModelTables[index]" type="warning" show-icon)
        | {{ t('drilldown.traces.nonModelTableHint') }}
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
  import { getTableSemantics, listSignalTables } from '@/observability/semantics'
  import {
    qualifyTraceLogsTable,
    resolveTraceLogsForServices,
    type TraceLogsTarget,
  } from '@/observability/traces/logs-association'
  import { fetchTraceServices } from '@/observability/adapters/traces'
  import useTableSchemaStore from '@/store/modules/table-schema'

  const props = defineProps<{
    visible: boolean
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
  /** Snapshot at hydrate time — detects user edits (edited rows are promoted to manual). */
  const hydratedSnapshot = ref<TraceLogsMapping[]>([])
  const tableOptions = ref<Record<number, string[]>>({})
  const loadingTables = ref<Record<number, boolean>>({})
  const nonModelTables = ref<Record<number, boolean>>({})
  const multiTable = ref(false)
  const hydrating = ref(false)

  const fallbackTable = computed(() => ctx.logsTable.value)

  const databaseOptions = computed(() => {
    const current = ctx.logsDatabase.value
    const names = databaseList.value.length ? [...databaseList.value] : []
    if (current && !names.includes(current)) {
      names.unshift(current)
    }
    return names.map((name) => ({ label: name, value: name }))
  })

  async function loadTableOptions(index: number) {
    const database = mappings.value[index]?.database || ctx.logsDatabase.value
    if (!database) {
      tableOptions.value[index] = []
      return
    }
    loadingTables.value[index] = true
    try {
      const tables = await listSignalTables('logs', {
        database,
        include: mappings.value[index]?.table ? [mappings.value[index].table] : [],
      })
      // The picker lists every table that can take part in trace → logs association —
      // the unified trace-side rule (logs evidence + trace_id), deliberately more
      // flexible than the probe: a service identity is NOT required here, so non-OTel
      // tables can be mapped manually. Declared logs float to the top.
      const withSemantics = await Promise.all(
        tables.map(async (table) => ({ table, semantics: await getTableSemantics(table, database) }))
      )
      const survivors = withSemantics
        .filter(({ semantics }) => !semantics?.signalType || semantics.signalType === 'log')
        .map(({ table }) => table)
      if (survivors.length) {
        await tableSchemaStore.ensureTableSchemas(survivors, database).catch(() => undefined)
      }
      const qualified = await Promise.all(
        tables.map(async (table) => {
          const semantics = withSemantics.find((item) => item.table === table)?.semantics
          if (semantics?.signalType && semantics.signalType !== 'log') {
            return undefined
          }
          let columns
          try {
            columns = await tableSchemaStore.ensureTableSchema(table, database)
          } catch {
            return undefined
          }
          const match = await qualifyTraceLogsTable(table, columns, database)
          if (!match) {
            return undefined
          }
          return { table, declared: semantics?.signalType === 'log' }
        })
      )
      tableOptions.value[index] = qualified
        .filter((item): item is { table: string; declared: boolean } => item !== undefined)
        .sort((a, b) => Number(b.declared) - Number(a.declared))
        .map((item) => item.table)
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

  /**
   * Self-sufficient hydration: the modal resolves its own routing (service universe +
   * probe/learned/fallback) on open. Schema batches, table lists and probe results are
   * all session-cached, so the cost is negligible — and no props race can hide rows.
   */
  async function hydrate() {
    const saved = loadDrilldownSettings(ctx.tracesDatabase.value).traces.traceLogsMappings ?? []
    hydratedSnapshot.value = saved.map((mapping) => ({ ...mapping }))
    tableOptions.value = {}
    loadingTables.value = {}
    nonModelTables.value = {}

    const services = await fetchTraceServices(ctx)
    const resolution = await resolveTraceLogsForServices(ctx, services)
    multiTable.value = resolution.multiTable

    if (!resolution.multiTable) {
      // 单表：映射没有路由价值，无行可编辑，关联按 Logs 页绑定表 / fields 解析走。
      mappings.value = []
      return
    }
    // 多表：行 = 自动提取的 service 全集，探测/学习结果作为初始值预填；
    // 歧义（不在 targets）或兜底命中的 service 留空，由用户指定。
    const allServices = [
      ...new Set([...services, ...Object.keys(resolution.targets), ...saved.map((mapping) => mapping.service)]),
    ].sort()
    mappings.value = allServices.map((service): TraceLogsMapping => {
      const stored = saved.find((item) => item.service === service)
      if (stored) {
        return { ...stored }
      }
      const target = resolution.targets[service]
      if (target && target.source !== 'current') {
        return { service, database: target.database, table: target.table, source: 'auto' }
      }
      return { service, database: ctx.logsDatabase.value, table: '', source: 'auto' }
    })
    mappings.value.forEach((_, index) => {
      loadTableOptions(index)
    })
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
      .map((mapping): TraceLogsMapping => {
        const service = mapping.service.trim()
        const database = mapping.database.trim()
        const table = mapping.table.trim()
        // Edited rows become user-authored; untouched auto rows stay auto.
        const original = hydratedSnapshot.value.find((item) => item.service === service)
        const edited =
          !original || original.service !== service || original.database !== database || original.table !== table
        const source = edited ? 'manual' : original?.source ?? 'manual'
        return { service, database, table, source }
      })
      .filter((mapping, index, all) => {
        return (
          mapping.service &&
          mapping.database &&
          mapping.table &&
          all.findIndex((item) => item.service === mapping.service) === index
        )
      })
    // Deleted auto entries are tombstoned so the probe does not re-learn them.
    const ignored = new Set(loadDrilldownSettings(ctx.tracesDatabase.value).traces.ignoredServiceKeys ?? [])
    hydratedSnapshot.value.forEach((item) => {
      if (item.source === 'auto' && !next.some((mapping) => mapping.service === item.service)) {
        ignored.add(item.service)
      }
    })
    updateTracesDrilldownSettings(
      { traceLogsMappings: next, ignoredServiceKeys: [...ignored] },
      ctx.tracesDatabase.value
    )
    emit('saved', next)
    emit('update:visible', false)
  }

  // Self-sufficient: re-run the (cached) routing on every open — no props race.
  watch(
    () => props.visible,
    (visible) => {
      if (visible && !hydrating.value) {
        hydrating.value = true
        hydrate().finally(() => {
          hydrating.value = false
        })
      }
    },
    { immediate: true }
  )
</script>

<style scoped lang="less">
  .trace-logs-settings__intro {
    margin-bottom: 0;
    color: var(--gpt-text-secondary);
    margin-top: 0;
  }

  .trace-logs-settings__row {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-sm);
    margin-bottom: var(--gpt-gap-sm);
    padding: var(--gpt-gap-sm);
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-md);
  }

  .trace-logs-settings__service-line {
    display: flex;
    min-width: 0;
    align-items: baseline;
    gap: var(--gpt-gap-sm);
  }

  .trace-logs-settings__service-label {
    flex-shrink: 0;
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-sm);
  }

  .trace-logs-settings__service {
    overflow: hidden;
    color: var(--gpt-text-primary);
    font-family: var(--font-mono, monospace);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trace-logs-settings__pair {
    display: grid;
    grid-template-columns: minmax(140px, 1fr) minmax(180px, 1.4fr);
    gap: var(--gpt-gap-sm);
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

  .trace-logs-settings__fallback {
    margin: 0 0 var(--gpt-gap-md);
    color: var(--gpt-text-secondary);
  }

  // 映射行可能很多：表单区限高内部滚动，标题/说明/添加按钮保持可见。
  // 直接用 slot 内容上的类名（与 __intro 同机制），scoped 必然命中。
  .trace-logs-settings__form {
    max-height: 60vh;
    overflow-y: auto;
  }
</style>
