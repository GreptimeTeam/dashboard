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
    a-space(:size="8")
      a-tooltip(mini :content="props.isInFullSizeMode ? $t('dashboard.exitFullSize') : $t('dashboard.fullSizeMode')")
        a-button(size="small" @click="toggleFullSize")
          template(#icon)
            svg.icon-16
              use(href="#zoom")
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
    ExplainTabs(:data="explainResult")
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
  import ExplainTabs from '@/components/explain-tabs/index.vue'

  const props = defineProps<{
    results: ResultType[]
    types: string[]
    explainResult?: ResultType
    isInFullSizeMode?: boolean
  }>()

  const emit = defineEmits(['update:explainResult', 'toggleFullSize'])

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

  const toggleFullSize = () => {
    emit('toggleFullSize', !props.isInFullSizeMode)
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
            font-weight: 600;
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
</style>
