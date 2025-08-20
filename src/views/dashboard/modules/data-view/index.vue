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
              use(href="#zoom")
      a-popconfirm(
        type="warning"
        cancel-text=""
        :content="$t('dashboard.clearResults')"
        :ok-text="$t('dashboard.clear')"
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
  a-tab-pane(v-for="(result) of results" :key="result.key" closable)
    template(#title)
      span {{ `${$t('dashboard.result')} ${Number(result.key) - startKey + 1}` }}
    .result-container
      .result-toolbar(v-if="result.query")
        .query-display
          a-popover(
            trigger="click"
            position="bl"
            content-class="code-tooltip"
            :content="result.query"
          )
            a-typography-text.query-text(code :ellipsis="{ rows: 1, css: true }") {{ result.query }}
        .toolbar-actions
          a-space(:size="0")
            a-tooltip(mini position="tr" :content="$t('dashboard.rerunQuery')")
              a-button(
                type="secondary"
                size="mini"
                :loading="refreshingKeys.has(result.key)"
                @click="refreshSingleResult(result)"
              )
                template(#icon)
                  svg.icon-12
                    use(href="#refresh")
            TextCopyable(
              size="mini"
              type="secondary"
              :data="result.query"
              :show-data="false"
              :button-text="false"
            )

      .result-content
        a-tabs.data-view-tabs(position="left" type="capsule" :animation="true")
          a-tab-pane(key="table")
            template(#title)
              a-tooltip(mini position="bl" :content="$t('dashboard.table')")
                a-space.title(direction="vertical" :size="4")
                  svg.icon-16
                    use(href="#table")
            DataGrid(:data="result" :has-header="false")
          a-tab-pane(v-if="useDataChart(result).hasChart.value" key="chart")
            template(#title)
              a-tooltip(mini position="bl" :content="$t('dashboard.chart')")
                a-space.title(direction="vertical" :size="4")
                  svg.icon-16
                    use(href="#chart")
            DataChart(:data="result" :has-header="false")
</template>

<script lang="ts" name="DataView" setup>
  import useDataChart from '@/hooks/data-chart'
  import useQueryCode from '@/hooks/query-code'
  import { useCodeRunStore } from '@/store'
  import type { ResultType } from '@/store/modules/code-run/types'
  import ExplainTabs from '@/components/explain-tabs/index.vue'

  const props = defineProps<{
    results: ResultType[]
    types: string[]
    explainResult?: ResultType
    isInFullSizeMode?: boolean
  }>()

  const emit = defineEmits(['update:explainResult', 'toggleFullSize'])

  const { removeResult, clear } = useCodeRunStore()
  const { refreshResult } = useQueryCode()
  const activeTabKey = ref<string | number>()
  const startKey = ref<number>((props.results[0]?.key as number) || 0)
  const refreshingKeys = ref(new Set<string | number>())

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

  const refreshSingleResult = async (result: ResultType) => {
    refreshingKeys.value.add(result.key)

    try {
      await refreshResult(result.key, result.type)
    } catch (error: any) {
      //
    } finally {
      refreshingKeys.value.delete(result.key)
    }
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
    border-bottom: 1px solid var(--color-border-2);
    padding: 0 6px;
    .query-display {
      flex: 1;
      margin-right: 12px;
      min-width: 0;

      :deep(.arco-typography.query-text) {
        margin: 0;
        white-space: nowrap;
        code {
          color: var(--small-font-color);
          background: var(--color-neutral-2);
          border-radius: 2px;
          padding: 4px 8px;
          font-size: 11px;
        }
      }
    }

    .toolbar-actions {
      flex-shrink: 0;
    }
  }

  .result-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
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
        font-size: 11px;
      }
    }
    :deep(.data-view-tabs) {
      width: 100%;
      height: 100%;
      .arco-tabs-nav-tab:not(.arco-tabs-nav-tab-scroll) {
        justify-content: flex-start;
      }
      .arco-tabs-tab {
        padding: 8px 4px;
        .title {
          align-items: center;
          .text {
            writing-mode: sideways-lr;
          }
        }
      }
      .arco-tabs-nav::before {
        background-color: transparent;
      }
      .arco-tabs-content {
        height: 100%;
      }

      > .arco-tabs-content > .arco-tabs-content-list > .arco-tabs-content-item {
        padding: 0;
      }
      .arco-card.data-grid {
        height: 100%;
        padding: 2px 8px;
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

  .result-extra {
    .arco-btn {
      height: 26px;
    }
  }
</style>
