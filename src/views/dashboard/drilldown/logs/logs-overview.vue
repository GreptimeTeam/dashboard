<template lang="pug">
a-layout-content.layout-content
  a-card.drilldown-main-pane.gpt-results-pane(:bordered="false")
    .drilldown-home-main
      .logs-overview
        .drilldown-toolbar.logs-overview-toolbar
          .drilldown-toolbar__left
            span.drilldown-toolbar__group
              span.drilldown-toolbar__label {{ t('dashboard.database') }}
              SignalDatabaseSelect(v-model="logsDatabase")
            span.drilldown-toolbar__group
              span.drilldown-toolbar__label {{ t('drilldown.logs.tableLabel') }}
              a-select.drilldown-table-select(
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
  import { computed, nextTick, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import { loadDrilldownSettings } from '@/observability/drilldown-settings'
  import { resolveFieldMapColumn } from '@/observability/filters'
  import { buildLogsFieldMap } from '@/observability/logs/field-map'
  import { bindSignalTable } from '@/observability/bind-signal-table'
  import useDrilldownKeepAlive from '@/observability/use-drilldown-keep-alive'
  import useSignalTableOptions from '@/observability/use-signal-table-options'
  import SignalDatabaseSelect from '../components/signal-database-select.vue'
  import LabelsTab from './labels-tab.vue'
  import LogsSettingsModal from './logs-settings-modal.vue'

  defineOptions({
    name: 'LogsOverview',
  })

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const { logsDatabase } = ctx
  const settingsVisible = ref(false)
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

  const keepAlive = useDrilldownKeepAlive({ deps: depsKey })
  const { isActive: overviewActive } = keepAlive
  const { tableOptions, loadingTables, loadTables } = useSignalTableOptions('logs', overviewActive)
  keepAlive.setResume(() => {
    loadTables()
    ctx.triggerRefresh()
  })

  watch(logsDatabase, () => {
    if (overviewActive.value) {
      loadTables()
    }
  })

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
    const settings = loadDrilldownSettings(ctx.logsDatabase.value).logs
    const savedFieldMap = settings.table === table ? settings.fieldMap : undefined
    const nextLogsFieldMap = await buildLogsFieldMap(table, savedFieldMap, ctx.logsDatabase.value)
    // Drop filters that no longer map onto the new table columns.
    ctx.filters.value = ctx.filters.value.filter((filter) =>
      Boolean(resolveFieldMapColumn(filter.key, nextLogsFieldMap))
    )
    ctx.fieldMap.value = {
      ...ctx.fieldMap.value,
      logs: nextLogsFieldMap,
    }
    ctx.logsTable.value = table
    // Refresh entity/column context for cross-signal filters on the newly bound table.
    await bindSignalTable(ctx, 'logs', table)
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

  /* Hug content so the action button sits next to the message instead of the far edge.
     max-width must subtract the alert's own margins — % bases do not include them. */
  :deep(.arco-alert) {
    width: fit-content;
    max-width: calc(100% - var(--gpt-page-padding-x) * 2);
    margin: var(--gpt-gap-lg) var(--gpt-page-padding-x);
  }
</style>
