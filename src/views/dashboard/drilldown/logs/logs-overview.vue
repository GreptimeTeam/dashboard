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
                size="medium"
                :model-value="logsTable"
                :placeholder="t('drilldown.logs.tablePlaceholder')"
                :loading="loadingTables"
                @change="onTableChange"
              )
                a-option(v-for="name in tableOptions" :key="name" :value="name") {{ name }}
          .drilldown-toolbar__right
            a-button(type="outline" size="medium" @click="settingsVisible = true")
              template(#icon)
                icon-settings
              | {{ t('drilldown.logs.settingsButton') }}

        a-alert(
          v-if="!logsTable"
          type="warning"
          show-icon
          :title="t('drilldown.logs.noTableTitle')"
          :description="t('drilldown.logs.noTableDescription')"
        )
          template(#action)
            a-button(type="primary" size="medium" @click="settingsVisible = true")
              | {{ t('drilldown.logs.settingsButton') }}

        .logs-overview-labels(v-else)
          LabelsTab(:auto-open-default="true")

        LogsSettingsModal(v-model:visible="settingsVisible")
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { IconSettings } from '@arco-design/web-vue/es/icon'
  import { useDrilldownContext } from '@/observability/context'
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
  const { logsDatabase } = ctx.connection
  const settingsVisible = ref(false)
  const logsTable = computed(() => ctx.semantics.logs.table.value)

  const depsKey = () =>
    JSON.stringify([
      ctx.query.refreshKey.value,
      ctx.semantics.logs.table.value,
      ctx.query.time.value,
      ctx.query.rangeTime.value[0],
      ctx.query.rangeTime.value[1],
      ctx.query.filters.value,
    ])

  const keepAlive = useDrilldownKeepAlive({ deps: depsKey })
  const { isActive: overviewActive } = keepAlive
  const { tableOptions, loadingTables, loadTables } = useSignalTableOptions('logs', overviewActive)
  keepAlive.setResume(() => {
    loadTables()
    ctx.actions.triggerRefresh()
  })

  watch(logsDatabase, () => {
    if (overviewActive.value) {
      loadTables()
    }
  })

  const onTableChange = async (table: string) => {
    if (!table || table === ctx.semantics.logs.table.value) {
      return
    }
    if (!tableOptions.value.includes(table)) {
      tableOptions.value = [...tableOptions.value, table]
    }
    await ctx.actions.bindTable('logs', table, { persist: true })
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
