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
        a-option(v-for="name in columnNames" :key="name" :value="name") {{ name }}
    a-form-item(:label="t('drilldown.logs.fieldPrimaryGroupBy')")
      a-select(
        v-model="form.primaryGroupBy"
        allow-search
        allow-clear
        :placeholder="t('drilldown.logs.columnPlaceholder')"
      )
        a-option(v-for="name in columnNames" :key="name" :value="name") {{ name }}
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
  import { reactive, ref, watch, nextTick } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { storeToRefs } from 'pinia'
  import editorApi from '@/api/editor'
  import { useAppStore } from '@/store'
  import { useDrilldownContext } from '@/observability/context'
  import { loadDrilldownSettings, updateLogsDrilldownSettings } from '@/observability/drilldown-settings'
  import { resolveFieldMapColumn } from '@/observability/filters'
  import {
    buildLogsFieldMap,
    inferLogsFieldDefaultsFromColumns,
    type SchemaColumn,
  } from '@/observability/logs/field-map'
  import { listLogTables } from '@/observability/logs/resolve-table'

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

  const applyFieldDefaults = (columns: SchemaColumn[]) => {
    const defaults = inferLogsFieldDefaultsFromColumns(columns)
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
      const current = ctx.logsTable.value || settings.table
      tableOptions.value = await listLogTables({ include: current ? [current] : [] })
      form.table = current || tableOptions.value[0] || ''
      form.time = settings.fieldMap?.time || ctx.fieldMap.value.logs.time
      form.body = settings.fieldMap?.body || ctx.fieldMap.value.logs.body
      form.severity = settings.fieldMap?.severity || ctx.fieldMap.value.logs.severity
      form.service = settings.fieldMap?.service || ctx.fieldMap.value.logs.service
      form.primaryGroupBy = settings.fieldMap?.primaryGroupBy || ctx.fieldMap.value.logs.primaryGroupBy
      form.traceId = settings.fieldMap?.traceId || ctx.fieldMap.value.logs.traceId
      await loadColumns(form.table)
    } finally {
      loadingTables.value = false
    }
  }

  const onTableChange = async (table: string) => {
    const columns = await loadColumns(table)
    applyFieldDefaults(columns)
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
