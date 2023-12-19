<template lang="pug">
a-tabs.result-tabs(
  type="rounded"
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
    v-for="(result, index) of results"
    :key="result.key"
    closable
    :title="`${$t('dashboard.result')} ${result.key - startKey + 1}`"
  )
    a-space(direction="vertical" size="small" fill)
      a-tabs.data-view-tabs(:animation="true")
        a-tab-pane(key="table" :title="$t('dashboard.table')")
          template(#title)
            a-space(:size="10")
              svg.icon-16
                use(href="#table")
              | {{ $t('dashboard.table') }}
          DataGrid(:data="result" :has-header="false")
        a-tab-pane(v-if="useDataChart(result).hasChart.value" key="chart" :title="$t('dashboard.chart')")
          template(#title)
            a-space(:size="10")
              svg.icon-16
                use(href="#chart")
              | {{ $t('dashboard.chart') }}
          DataChart(:data="result" :has-header="false")
</template>

<script lang="ts" name="DataView" setup>
  import useDataChart from '@/hooks/data-chart'
  import { useCodeRunStore } from '@/store'
  import type { ResultType } from '@/store/modules/code-run/types'

  const props = defineProps<{
    results: ResultType[]
    types: string[]
  }>()

  const { removeResult, clear } = useCodeRunStore()
  const activeTabKey = ref(props.results[0]?.key)
  const startKey = ref(props.results[0]?.key)

  const deleteTab = async (key: number) => {
    const index = props.results.findIndex((result) => result.key === key && props.types.includes(result.type))
    if (props.results.length === 1) {
      startKey.value = props.results[0].key
    }
    await removeResult(key, props.results[index].type)
    if (activeTabKey.value === key) {
      activeTabKey.value = props.results[index]?.key || props.results.slice(-1)[0].key
    }
  }

  const tabClick = (key: any) => {
    activeTabKey.value = key
  }

  const clearResults = () => {
    startKey.value = props.results[0].key
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
