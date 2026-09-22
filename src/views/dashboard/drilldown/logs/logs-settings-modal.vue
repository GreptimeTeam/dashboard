<template lang="pug">
a-modal(
  unmount-on-close
  :visible="visible"
  :title="t('drilldown.logs.settingsTitle')"
  :ok-text="t('drilldown.logs.settingsSave')"
  :cancel-text="t('drilldown.logs.settingsCancel')"
  @ok="handleSave"
  @cancel="emit('update:visible', false)"
  @update:visible="emit('update:visible', $event)"
)
  a-form(layout="vertical")
    a-form-item(:label="t('drilldown.logs.tableLabel')")
      a-select(
        v-model="form.table"
        allow-search
        allow-create
        :placeholder="t('drilldown.logs.tablePlaceholder')"
        :loading="loadingTables"
        @change="onTableChange"
      )
        a-option(v-for="name in tableOptions" :key="name" :value="name") {{ name }}
    a-form-item(:label="t('drilldown.logs.fieldTime')")
      a-select(
        v-model="form.time"
        allow-search
        allow-clear
        :placeholder="t('drilldown.logs.columnPlaceholder')"
      )
        a-option(v-for="name in columnNames" :key="name" :value="name") {{ name }}
    a-form-item(:label="t('drilldown.logs.fieldBody')")
      a-select(
        v-model="form.body"
        allow-search
        allow-clear
        :placeholder="t('drilldown.logs.columnPlaceholder')"
      )
        a-option(v-for="name in columnNames" :key="name" :value="name") {{ name }}
    a-form-item(:label="t('drilldown.logs.fieldSeverity')")
      a-select(
        v-model="form.severity"
        allow-search
        allow-clear
        :placeholder="t('drilldown.logs.columnPlaceholder')"
      )
        a-option(v-for="name in columnNames" :key="name" :value="name") {{ name }}
    a-form-item(:label="t('drilldown.logs.fieldService')")
      a-select(
        v-model="form.service"
        allow-search
        allow-clear
        :placeholder="t('drilldown.logs.columnPlaceholder')"
      )
        a-option(v-for="name in serviceColumnOptions" :key="name" :value="name") {{ name }}
    a-form-item(:label="t('drilldown.logs.fieldPrimaryGroupBy')")
      a-select(
        v-model="form.primaryGroupBy"
        allow-search
        allow-clear
        :placeholder="t('drilldown.logs.columnPlaceholder')"
      )
        a-option(v-for="name in serviceColumnOptions" :key="name" :value="name") {{ name }}
    a-form-item(:label="t('drilldown.logs.fieldTraceId')")
      a-select(
        v-model="form.traceId"
        allow-search
        allow-clear
        :placeholder="t('drilldown.logs.columnPlaceholder')"
      )
        a-option(v-for="name in columnNames" :key="name" :value="name") {{ name }}
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch, nextTick } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { storeToRefs } from 'pinia'
  import editorApi from '@/api/editor'
  import { useAppStore } from '@/store'
  import { useDrilldownContext } from '@/observability/context'
  import {
    loadDrilldownSettings,
    updateLogsDrilldownSettings,
    type LogsFieldMapSettings,
  } from '@/observability/drilldown-settings'
  import { resolveFieldMapColumn } from '@/observability/filters'
  import { entityColumnFilterKey, listSignalTables, resolveEntityFilterRef } from '@/observability/semantics'
  import {
    buildLogsFieldMap,
    resolveLogsSettingsFieldDefaults,
    type SchemaColumn,
  } from '@/observability/logs/field-map'

  const props = defineProps<{
    visible: boolean
  }>()

  const emit = defineEmits<{
    'update:visible': [boolean]
    'saved': []
  }>()

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const { database } = storeToRefs(useAppStore())

  const loadingTables = ref(false)
  const tableOptions = ref<string[]>([])
  const columnNames = ref<string[]>([])

  const form = reactive({
    table: '' as string,
    time: undefined as string | undefined,
    body: undefined as string | undefined,
    severity: undefined as string | undefined,
    service: undefined as string | undefined,
    primaryGroupBy: undefined as string | undefined,
    traceId: undefined as string | undefined,
  })

  /**
   * Service / primary group by accept a JSON chip (`resource_attributes.service.name`) next
   * to real columns — that is the shape semantics produce for OTLP logs, so the current
   * value has to stay selectable or saving would wipe it.
   */
  const serviceColumnOptions = computed(() => {
    const names = [...columnNames.value]
    const extra = [form.service, form.primaryGroupBy].filter(
      (value): value is string => Boolean(value) && !names.includes(value as string)
    )
    return [...names, ...new Set(extra)]
  })

  /**
   * Field values for `table`: semantics first (time/body/severity/traceId from the OTEL logs
   * model, service from the entity resolution), saved values winning where still valid.
   */
  const applyFieldDefaults = async (table: string, columns: SchemaColumn[], saved?: LogsFieldMapSettings) => {
    let serviceColumn: string | undefined
    if (table && columns.length) {
      const reference = await resolveEntityFilterRef(table, 'service', { signal: 'logs', columns })
      serviceColumn = reference ? entityColumnFilterKey(reference) : undefined
    }
    const defaults = resolveLogsSettingsFieldDefaults(columns, saved, { serviceColumn })
    form.time = defaults.time
    form.body = defaults.body
    form.severity = defaults.severity
    form.service = defaults.service
    form.primaryGroupBy = defaults.primaryGroupBy
    form.traceId = defaults.traceId
  }

  const loadColumns = async (table: string): Promise<SchemaColumn[]> => {
    if (!table) {
      columnNames.value = []
      return []
    }
    try {
      const columns = await editorApi.getTableSchema(table)
      columnNames.value = columns.map((c) => c.name)
      return columns
    } catch {
      columnNames.value = []
      return []
    }
  }

  const hydrate = async () => {
    loadingTables.value = true
    try {
      const settings = loadDrilldownSettings(database.value).logs
      // Older seeds stored only a field map; fall back to the bound table so the column list
      // (and with it every saved value) still hydrates.
      const savedTable = settings.table?.trim() || ctx.logsTable.value || ''
      tableOptions.value = await listSignalTables('logs', { include: savedTable ? [savedTable] : [] })
      form.table = savedTable
      const columns = await loadColumns(form.table)
      await applyFieldDefaults(form.table, columns, settings.fieldMap)
    } finally {
      loadingTables.value = false
    }
  }

  const onTableChange = async (table: string) => {
    const columns = await loadColumns(table)
    await applyFieldDefaults(table, columns)
  }

  watch(
    () => props.visible,
    (open) => {
      if (open) {
        hydrate()
      }
    }
  )

  const handleSave = async () => {
    if (!form.table) {
      return
    }

    const fieldMap = {
      time: form.time,
      body: form.body,
      severity: form.severity,
      service: form.service,
      primaryGroupBy: form.primaryGroupBy || form.service,
      traceId: form.traceId,
    }

    // Build next map before touching ctx — avoid watches firing with new table + old fields.
    const nextLogsFieldMap = await buildLogsFieldMap(form.table, fieldMap)

    updateLogsDrilldownSettings(
      {
        table: form.table,
        fieldMap,
      },
      database.value
    )

    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      logs: nextLogsFieldMap,
    }
    ctx.filters.value = ctx.filters.value.filter((filter) =>
      Boolean(resolveFieldMapColumn(filter.key, nextLogsFieldMap))
    )
    ctx.logsTable.value = form.table
    await nextTick()
    ctx.triggerRefresh()
    emit('update:visible', false)
    emit('saved')
  }
</script>
