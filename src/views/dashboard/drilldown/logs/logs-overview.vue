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
  import { computed, nextTick, onActivated, onDeactivated, onMounted, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { storeToRefs } from 'pinia'
  import { useAppStore } from '@/store'
  import { useDrilldownContext } from '@/observability/context'
  import { loadDrilldownSettings } from '@/observability/drilldown-settings'
  import { resolveFieldMapColumn } from '@/observability/filters'
  import { buildLogsFieldMap } from '@/observability/logs/field-map'
  import { listLogTables } from '@/observability/logs/resolve-table'
  import LabelsTab from './labels-tab.vue'
  import LogsSettingsModal from './logs-settings-modal.vue'

  defineOptions({
    name: 'LogsOverview',
  })

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const { database } = storeToRefs(useAppStore())

  const settingsVisible = ref(false)
  const loadingTables = ref(false)
  const tableOptions = ref<string[]>([])
  const overviewActive = ref(true)
  let pausedDepsKey = ''

  const logsTable = computed(() => ctx.logsTable.value)

  const depsKey = () =>
    JSON.stringify([
      ctx.refreshKey.value,
      ctx.logsTable.value,
      ctx.time.value,
      ctx.rangeTime.value[0],
      ctx.rangeTime.value[1],
      ctx.filters.value,
    ])

  const loadTables = async () => {
    if (!overviewActive.value) {
      return
    }
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
    // Session view only. Roles come from saved field settings, never from name guessing.
    const settings = loadDrilldownSettings(database.value).logs
    const savedFieldMap = settings.table === table ? settings.fieldMap : undefined
    const nextLogsFieldMap = await buildLogsFieldMap(table, savedFieldMap)
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

  onDeactivated(() => {
    overviewActive.value = false
    pausedDepsKey = depsKey()
  })

  onActivated(() => {
    overviewActive.value = true
    if (pausedDepsKey && pausedDepsKey !== depsKey()) {
      loadTables()
      ctx.triggerRefresh()
    }
    pausedDepsKey = ''
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
    gap: var(--gpt-gap-lg);
    padding: var(--gpt-toolbar-padding);
    border-bottom: 1px solid var(--gpt-border-default);
    background: var(--gpt-table-toolbar-bg, var(--color-bg-2));
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: var(--gpt-gap-md);
    min-width: 0;
  }

  .toolbar-label {
    flex-shrink: 0;
    font-size: var(--gpt-font-base);
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
    margin: var(--gpt-gap-lg) var(--gpt-page-padding-x);
  }
</style>
