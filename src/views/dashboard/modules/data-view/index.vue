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
    a-popconfirm(
      content="Clear results?"
      type="warning"
      ok-text="Clear"
      cancel-text=""
      @ok="clearResults"
    )
      a-button(status="danger" size="small") {{ $t('dashboard.clear') }}
  a-tab-pane(
    v-if="explainResult"
    key="explain"
    closable
    :title="`${$t('dashboard.explain')}`"
  )
    a-tabs.data-view-tabs(lazy-load :animation="true")
      a-tab-pane(key="explain-grid")
        template(#title)
          | {{ $t('dashboard.table') }}
        a-space(direction="vertical" :size="0")
          ExplainGrid(
            v-for="(stage, index) in getStages(explainResult)"
            :key="index"
            :data="stage"
            :index="index"
          )
      a-tab-pane(key="explain-chart")
        template(#title)
          | {{ $t('dashboard.chart') }}
        ExplainChart(
          v-for="(stage, index) in getStages(explainResult)"
          :key="index"
          :data="stage"
          :index="index"
        )
      a-tab-pane(key="explain-raw")
        template(#title)
          | {{ $t('dashboard.raw') }}
        a-card.raw-json-card(:bordered="false")
          template(#title)
            a-button(size="mini" type="outline" @click="exportExplainJson(explainResult)")
              template(#icon)
                icon-download
              | {{ $t('dashboard.download') }}
          pre.raw-json {{ formatRawJson(explainResult) }}
  a-tab-pane(
    v-for="(result, index) of results"
    :key="result.key"
    closable
    :title="`${$t('dashboard.result')} ${result.key - startKey + 1}`"
  )
    a-tabs.data-view-tabs(:animation="true")
      a-tab-pane(key="table")
        template(#title)
          a-space(:size="10")
            svg.icon-16
              use(href="#table")
            | {{ $t('dashboard.table') }}
        DataGrid(:data="result" :has-header="false")
      a-tab-pane(v-if="useDataChart(result).hasChart.value" key="chart")
        template(#title)
          a-space(:size="10")
            svg.icon-16
              use(href="#chart")
            | {{ $t('dashboard.chart') }}
        DataChart(:data="result" :has-header="false")
</template>

<script lang="ts" name="DataView" setup>
  import useDataChart from '@/hooks/data-chart'
  import i18n from '@/locale'
  import { useCodeRunStore } from '@/store'
  import type { ResultType } from '@/store/modules/code-run/types'
  import { Message } from '@arco-design/web-vue'
  import fileDownload from 'js-file-download'

  const props = defineProps<{
    results: ResultType[]
    types: string[]
    explainResult?: ResultType
  }>()

  const emit = defineEmits(['update:explainResult'])

  const { removeResult, clear } = useCodeRunStore()
  const activeTabKey = ref<string | number>()
  const startKey = ref<number>((props.results[0]?.key as number) || 0)

  // Add a method to select specific tab
  const selectTab = (key: number | string) => {
    activeTabKey.value = key
  }

  defineExpose({
    selectTab,
  })

  const deleteTab = async (key: number | string) => {
    if (key === 'explain') {
      emit('update:explainResult', null)

      if (activeTabKey.value === 'explain') {
        const firstResultKey = props.results.length > 0 ? props.results[0].key : undefined
        activeTabKey.value = firstResultKey
      }
      return
    }

    const index = props.results.findIndex((result) => result.key === key && props.types.includes(result.type))
    if (props.results.length === 1) {
      startKey.value = props.results[0].key as number
    }
    await removeResult(key, props.results[index].type)
    if (activeTabKey.value === key) {
      activeTabKey.value = props.results[index]?.key || props.results.slice(-1)[0].key
    }
  }

  const tabClick = (key: string | number) => {
    activeTabKey.value = key
  }

  const clearResults = () => {
    startKey.value = props.results[0]?.key as number
    clear(props.types)
  }

  watch(
    () => ({ ...props }),
    (value, old) => {
      if (value.results.length > old.results.length) {
        activeTabKey.value = props.results.slice(-1)[0].key
      }
    }
  )

  watch(
    () => props.explainResult,
    (newValue, oldValue) => {
      if (newValue && newValue !== oldValue && newValue.key) {
        activeTabKey.value = 'explain'
      }
    },
    { immediate: true }
  )

  const getStages = computed(() => (result: ResultType) => {
    const { rows } = result.records

    const rowsData = rows.filter((row: any) => row[0] !== null)
    const stagesMap = new Map()
    rowsData.forEach((row: any) => {
      const stageIndex = row[0].toString()

      if (stagesMap.has(stageIndex)) {
        stagesMap.set(stageIndex, [...stagesMap.get(stageIndex), row])
      } else {
        stagesMap.set(stageIndex, [row])
      }
    })
    return Array.from(stagesMap.values())
  })

  const reconstructExplainJson = (result: ResultType) => {
    return {
      output: [
        {
          records: result.records,
        },
      ],
      execution_time_ms: result.executionTime,
    }
  }

  const formatRawJson = (result: ResultType) => {
    try {
      return JSON.stringify(reconstructExplainJson(result), null, 2)
    } catch (e) {
      return 'Error formatting JSON data'
    }
  }

  const exportExplainJson = (result: ResultType) => {
    try {
      const jsonData = JSON.stringify(reconstructExplainJson(result), null, 2)
      fileDownload(jsonData, 'explain-analyze-greptimedb.json', 'application/json')
      Message.success('JSON downloaded successfully')
    } catch (e) {
      Message.error(`Failed to export JSON: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
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

    .arco-tabs-nav-tab-list {
      display: flex;
    }
  }
</style>

<style lang="less" scoped>
  .arco-btn {
    border-radius: 2px;
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
        .arco-tabs-nav-tab-list > :not(:first-child) {
          .arco-tabs-tab-title {
            border-left: 1px solid var(--border-color);
          }
        }
        .arco-tabs-tab {
          padding: 2px 0;
          margin: 0;
          color: var(--main-font-color);
          &:first-of-type {
            border-top-left-radius: 4px;
            border-bottom-left-radius: 4px;
          }
          &:nth-last-of-type(2) {
            border-top-right-radius: 4px;
            border-bottom-right-radius: 3px;
          }
          &.arco-tabs-tab-active {
            color: var(--brand-color);
            font-weight: 400;
          }
          > .arco-tabs-tab-title {
            width: 84px;
            padding-left: 10px;
            display: flex;
            font-size: 12px;
            height: 20px;
            &::before {
              border-radius: 4px;
              left: 0;
              right: 0;
              top: -6px;
              bottom: -6px;
            }
          }
        }
      }
      .arco-table.data-table .arco-table-container {
        border-radius: 0;
        border: none;
      }
      .arco-table-size-mini .arco-table-td {
        font-size: 11px;
      }
    }
    :deep(.data-view-tabs) {
      width: 100%;
      height: 100%;
      .arco-tabs-nav::before {
        background-color: transparent;
      }
      > .arco-tabs-content {
        height: calc(100% - 24px);
      }
      .arco-tabs-nav-tab-list {
        display: flex;
      }
      > .arco-tabs-content > .arco-tabs-content-list > .arco-tabs-content-item {
        padding: 0;
      }
      .arco-card.data-grid {
        height: 100%;
        padding: 0 8px;
        > .arco-card-body {
          height: 100%;
          > .arco-spin {
            height: 100%;
            .arco-table-pagination {
              margin: 0;
              .arco-pagination-total {
                font-size: 11px;
              }
              .arco-pagination-item {
                font-size: 11px;
              }
              .arco-pagination-options .arco-select-view-value {
                font-size: 11px;
              }
              .arco-pagination-jumper > span {
                font-size: 12px;
              }
              .arco-input-wrapper .arco-input.arco-input-size-medium {
                padding-top: 2px;
                padding-bottom: 1px;
                font-size: 11px;
              }
            }
          }
        }
      }
    }
  }

  .raw-json-card {
    padding: 8px 12px;

    :deep(.arco-card-header) {
      height: 40px;
    }

    :deep(.arco-card-body) {
      height: calc(100% - 40px);
      padding: 8px;
      overflow: auto;
    }

    .raw-json {
      white-space: pre-wrap;
      font-family: monospace;
      font-size: 12px;
      margin: 0;
    }
  }
</style>
