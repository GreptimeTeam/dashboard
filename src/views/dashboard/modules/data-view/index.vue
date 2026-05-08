<template lang="pug">
a-tabs.panel-tabs(
  type="line"
  lazy-load
  editable
  :active-key="activeTabKey"
  :animation="true"
  @tab-click="tabClick"
  @delete="deleteTab"
)
  template(#extra)
    a-space.result-extra(:size="8")
      a-tooltip(mini :content="props.isInFullSizeMode ? $t('dashboard.exitFullSize') : $t('dashboard.fullSizeMode')")
        a-button(size="small" @click="toggleFullSize")
          template(#icon)
            svg.icon-16
              use(v-if="!props.isInFullSizeMode" href="#zoom")
              use(v-else href="#zoom-out")
      a-popconfirm(
        type="warning"
        cancel-text=""
        :content="$t('dashboard.clearResults')"
        :ok-text="$t('dashboard.clear')"
        @ok="clearResults"
      )
        a-button(status="danger" size="small") {{ $t('dashboard.clear') }}
  a-tab-pane(
    v-for="(explainResult, idx) in session.explainResults.value"
    :key="explainResult.key"
    closable
    :title="`${$t('dashboard.explain')} ${idx + 1}`"
  )
    ExplainTabs(:data="explainResult")
  a-tab-pane(v-for="(result) of session.results.value" :key="result.key" closable)
    template(#title)
      span {{ `${$t('dashboard.result')} ${Number(result.key) - startKey + 1}` }}
    .result-container
      .result-toolbar(v-if="result.query")
        .view-switch
          a-tooltip(mini position="bl" :content="$t('dashboard.table')")
            a-button(
              size="mini"
              type="text"
              :class="{ active: getResultView(result.key) === 'table' }"
              @click="setResultView(result.key, 'table')"
            )
              svg.icon-16
                use(href="#table")
          a-tooltip(
            v-if="useDataChart(result).hasChart.value"
            mini
            position="bl"
            :content="$t('dashboard.chart')"
          )
            a-button(
              size="mini"
              type="text"
              :class="{ active: getResultView(result.key) === 'chart' }"
              @click="setResultView(result.key, 'chart')"
            )
              svg.icon-16
                use(href="#chart")
        .query-display
          a-popover(
            trigger="click"
            position="bl"
            content-class="code-tooltip"
            :content="result.query"
          )
            a-typography-text.query-text(code :ellipsis="{ rows: 1, css: true }") {{ result.query }}
          TextCopyable(
            size="mini"
            type="secondary"
            :data="result.query"
            :show-data="false"
            :button-text="false"
          )
        .toolbar-actions
          a-space(:size="0")
            a-tooltip(mini position="tr" :content="$t('dashboard.rerunQuery')")
              a-button(
                v-if="result.type === 'sql'"
                type="secondary"
                size="mini"
                :loading="refreshingKeys.has(result.key)"
                @click="refreshSingleResult(result)"
              )
                template(#icon)
                  svg.icon-12
                    use(href="#refresh")
            a-checkbox(v-if="getResultView(result.key) === 'table'" v-model="wrapLines" size="small")
              | {{ $t('dashboard.wrapLines') }}

      .result-content
        .table-panel(v-if="getResultView(result.key) === 'table'")
          PaginatedDataTable(
            size="mini"
            :data="tableModelMap[result.key]?.rows || []"
            :columns="tableModelMap[result.key]?.columns || []"
            :displayed-columns="tableModelMap[result.key]?.displayedColumns || []"
            :ts-column="tableModelMap[result.key]?.tsColumn || null"
            :show-context-menu="false"
            :wrap-line="wrapLines"
          )
        DataChart(
          v-else-if="useDataChart(result).hasChart.value"
          :key="`chart-${result.key}-${result.refreshCount || 0}`"
          :data="result"
          :has-header="false"
        )
</template>

<script lang="ts" name="DataView" setup>
  import useDataChart from '@/hooks/data-chart'
  import type { ResultType } from '@/store/modules/code-run/types'
  import { normalizeRecordsToTableModel } from '@/utils/table-normalizer'
  import type { NormalizedTableModel } from '@/utils/table-normalizer'
  import ExplainTabs from '@/components/explain-tabs/index.vue'
  import { useQuerySession } from '@/views/dashboard/query/use-query-session'

  const props = defineProps<{
    isInFullSizeMode?: boolean
  }>()

  const emit = defineEmits(['toggleFullSize'])
  const session = useQuerySession()

  const activeTabKey = ref<string | number>()
  const startKey = ref<number>((session.results.value[0]?.key as number) || 0)
  const refreshingKeys = ref(new Set<string | number>())
  const resultViewMap = ref<Record<string | number, 'table' | 'chart'>>({})
  const wrapLines = ref(false)
  // Add a method to select specific tab
  const selectTab = (key: number | string) => {
    activeTabKey.value = key
  }

  defineExpose({
    selectTab,
  })

  const deleteTab = async (key: number | string) => {
    const explainIndex = session.explainResults.value.findIndex((result) => result.key === key)
    if (explainIndex >= 0) {
      session.removeExplainResult({ key })
      if (activeTabKey.value === key) {
        activeTabKey.value = session.results.value.length
          ? session.results.value.slice(-1)[0].key
          : session.explainResults.value.slice(-1)[0]?.key
      }
      return
    }

    const index = session.results.value.findIndex((result) => result.key === key)
    if (index < 0) return

    if (session.results.value.length === 1) {
      startKey.value = session.results.value[0].key as number
    }
    session.removeResult({ key, type: session.results.value[index].type })
    if (activeTabKey.value === key) {
      activeTabKey.value = session.results.value[index]?.key || session.results.value.slice(-1)[0].key
    }
  }

  const tabClick = (key: string | number) => {
    activeTabKey.value = key
  }

  const clearResults = () => {
    startKey.value = session.results.value[0]?.key as number
    session.clearAll()
    emit('toggleFullSize', false)
  }

  const refreshSingleResult = async (result: ResultType) => {
    refreshingKeys.value.add(result.key)

    try {
      await session.refreshSingleResult(result)
    } catch (error: any) {
      console.error(error)
    } finally {
      refreshingKeys.value.delete(result.key)
    }
  }

  const toggleFullSize = () => {
    emit('toggleFullSize', !props.isInFullSizeMode)
  }

  const getResultView = (resultKey: string | number) => {
    return resultViewMap.value[resultKey] || 'table'
  }

  const setResultView = (resultKey: string | number, view: 'table' | 'chart') => {
    resultViewMap.value[resultKey] = view
  }

  const tableModelMap = computed<Record<string, NormalizedTableModel>>(() => {
    return session.results.value.reduce((acc, result) => {
      acc[String(result.key)] = normalizeRecordsToTableModel(result?.records)
      return acc
    }, {} as Record<string, NormalizedTableModel>)
  })

  watch(
    () => session.results.value.length,
    (len, oldLen) => {
      if (len > oldLen) {
        activeTabKey.value = session.results.value.slice(-1)[0].key
      }
    }
  )

  watch(
    () => session.explainResults.value.length,
    (len, oldLen) => {
      if (len > oldLen && session.explainResults.value.length > 0) {
        activeTabKey.value = session.explainResults.value.slice(-1)[0].key
      }
    },
    { immediate: true }
  )
</script>

<style lang="less">
  .data-view-tabs {
    width: 100%;
    .arco-tabs-nav::before {
      background-color: transparent;
    }
    > .arco-tabs-content > .arco-tabs-content-list > .arco-tabs-content-item {
      padding: 15px 0;
    }
  }
</style>

<style lang="less" scoped>
  .result-container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .result-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--gpt-border-default);
    background: var(--gpt-table-toolbar-bg);
    min-height: 39px;
    padding: 6px 12px 7px 12px;
    gap: 8px;

    .view-switch {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      gap: 2px;

      .arco-btn {
        color: var(--gpt-text-secondary);
        border-radius: var(--gpt-radius-sm);
      }

      .arco-btn.active {
        color: var(--gpt-text-inverse);
        background: var(--gpt-brand-900);
      }
    }

    .query-display {
      flex: 1;
      margin-right: 6px;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;

      :deep(.arco-typography.query-text) {
        margin: 0;
        white-space: nowrap;
        code {
          color: var(--gpt-brand-700);
          background: transparent;
          border-radius: 0;
          padding: 4px 8px;
          font-size: 11px;
          font-family: var(--font-mono);
        }
      }
    }

    .toolbar-actions {
      flex-shrink: 0;
      :deep(.arco-checkbox) {
        font-size: 11px;
      }
    }
  }

  .result-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;

    .table-panel {
      height: 100%;
      display: flex;
      flex-direction: column;
      min-height: 0;

      :deep(.data-table-container) {
        flex: 1;
        min-height: 0;
      }
    }
  }

  .arco-tabs.panel-tabs {
    .arco-tabs-content .arco-tabs-content-item {
      height: 100%;
      // TODO: better scrollbar style
      max-height: none;
    }
    :deep(> .arco-tabs-content) {
      > .arco-tabs-content-list > .arco-tabs-content-item {
        padding: 0;
        .arco-tabs-nav-ink {
          background: transparent;
        }

        .arco-tabs-tab {
          &.arco-tabs-tab-active {
            color: var(--brand-color);
            font-weight: 600;
          }
        }
      }
      .arco-table-size-mini .arco-table-td {
        font-size: 12px;
      }
      .arco-table-th {
        background: var(--gpt-table-head-bg);
        color: var(--gpt-text-primary);
        border-bottom: 1px solid var(--gpt-border-default);
      }
      .arco-table-td {
        border-bottom: 1px solid var(--gpt-border-subtle);
        color: var(--gpt-text-primary);
      }
    }
    :deep(.arco-card.data-grid) {
      height: 100%;
      padding: 0;
      border-radius: 0;
    }
  }

  .result-extra {
    .arco-btn {
      height: 26px;
      border-radius: var(--gpt-radius-sm);
    }
  }
</style>
