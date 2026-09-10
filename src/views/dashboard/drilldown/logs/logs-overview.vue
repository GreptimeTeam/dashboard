<template lang="pug">
.logs-overview
  .logs-overview-toolbar
    .toolbar-left
      span.toolbar-label {{ t('drilldown.logs.tableLabel') }}
      a-select.table-select(
        allow-search
        allow-create
        :model-value="logsTable"
        :placeholder="t('drilldown.logs.tablePlaceholder')"
        :loading="loadingTables"
        @change="onTableChange"
      )
        a-option(v-for="name in tableOptions" :key="name" :value="name") {{ name }}
      a-button(type="text" size="small" @click="settingsVisible = true")
        | {{ t('drilldown.logs.settingsButton') }}

  a-alert(
    v-if="!logsTable"
    type="warning"
    show-icon
    :title="t('drilldown.logs.noTableTitle')"
    :description="t('drilldown.logs.noTableDescription')"
  )
    template(#action)
      a-button(type="primary" size="small" @click="settingsVisible = true")
        | {{ t('drilldown.logs.settingsButton') }}

  .logs-overview-labels(v-else)
    LabelsTab(:auto-open-default="true")

  LogsSettingsModal(v-model:visible="settingsVisible" @saved="onSettingsSaved")
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/store'
  import { useDrilldownContext } from '@/observability/context'
  import { loadDrilldownSettings, saveDrilldownSettings } from '@/observability/drilldown-settings'
  import { resolveFieldMapColumn } from '@/observability/filters'
  import { buildLogsFieldMap } from '@/observability/logs/field-map'
  import { listLogTables } from '@/observability/logs/resolve-table'
  import LabelsTab from './labels-tab.vue'
  import LogsSettingsModal from './logs-settings-modal.vue'

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const { database } = storeToRefs(useAppStore())

  const settingsVisible = ref(false)
  const loadingTables = ref(false)
  const tableOptions = ref<string[]>([])

  const logsTable = computed(() => ctx.logsTable.value)

  const loadTables = async () => {
    loadingTables.value = true
    try {
      const current = ctx.logsTable.value
      tableOptions.value = await listLogTables({ include: current ? [current] : [] })
    } finally {
      loadingTables.value = false
    }
  }

  const onSettingsSaved = () => {
    ctx.triggerRefresh()
  }

  const onTableChange = async (table: string) => {
    if (!table || table === ctx.logsTable.value) {
      return
    }
    if (!tableOptions.value.includes(table)) {
      tableOptions.value = [...tableOptions.value, table]
    }
    // Infer fields for the new table before updating ctx (same-tick apply).
    const nextLogsFieldMap = await buildLogsFieldMap(table)
    const settings = loadDrilldownSettings(database.value)
    settings.logs.table = table
    settings.logs.fieldMap = undefined
    saveDrilldownSettings(settings, database.value)
    // Drop filters that no longer map onto the new table columns.
    ctx.filters.value = ctx.filters.value.filter((filter) =>
      Boolean(resolveFieldMapColumn(filter.key, nextLogsFieldMap))
    )
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      logs: nextLogsFieldMap,
    }
    ctx.logsTable.value = table
    // Let labels-tab sync-clear old panes before refresh fires per-panel SQL.
    await nextTick()
    ctx.triggerRefresh()
  }

  onMounted(async () => {
    await loadTables()
  })
</script>

<style scoped lang="less">
  .logs-overview {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    gap: 0;
    min-height: 0;
    padding: 0;
    overflow: hidden;
  }

  .logs-overview-toolbar {
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: var(--gpt-toolbar-padding, 8px 16px);
    border-bottom: 1px solid var(--gpt-border-default);
    background: var(--gpt-table-toolbar-bg, var(--color-bg-2));
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .toolbar-label {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--color-text-3);
  }

  .table-select {
    width: 240px;
  }

  .logs-overview-labels {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;

    :deep(.labels-tab) {
      padding: 0;
    }
  }

  :deep(.arco-alert) {
    margin: 12px 16px;
  }
</style>
