<template lang="pug">
a-tabs.explain-tabs(lazy-load :animation="true")
  a-tab-pane(key="explain-grid")
    template(#title)
      | {{ $t('dashboard.table') }}
    a-space(direction="vertical" :size="0")
      ExplainGrid(
        v-for="(stage, index) in stages"
        :key="index"
        :data="stage"
        :index="index"
      )
  a-tab-pane(key="explain-chart")
    template(#title)
      | {{ $t('dashboard.chart') }}
    ExplainChart(
      :data="stages[activeStageIndex]"
      :index="activeStageIndex"
      :total-stages="stages.length"
      @change-stage="activeStageIndex = $event"
    )
  a-tab-pane(key="explain-raw")
    template(#title)
      | {{ $t('dashboard.raw') }}
    a-card.raw-json-card(:bordered="false")
      template(#title)
        a-space
          a-button(size="mini" type="outline" @click="exportJson")
            template(#icon)
              icon-download
            | {{ $t('dashboard.download') }}
          TextCopyable(
            type="outline"
            size="mini"
            buttonText
            :data="formattedRawJson"
            :show-data="false"
          )
      pre.raw-json {{ formattedRawJson }}
</template>

<script lang="ts" setup>
  import { Message } from '@arco-design/web-vue'
  import fileDownload from 'js-file-download'
  import type { ResultType } from '@/store/modules/code-run/types'
  import ExplainGrid from '@/views/dashboard/modules/explain/explain-grid.vue'
  import ExplainChart from '@/views/dashboard/modules/explain/explain-chart/index.vue'
  import TextCopyable from '@/components/text-copyable.vue'

  const props = defineProps<{
    data: ResultType
  }>()

  const activeStageIndex = ref(1)

  // Process stages from explain result data
  const getStages = (result: ResultType) => {
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
  }

  const stages = computed(() => {
    if (!props.data) return []
    return getStages(props.data)
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

  const formattedRawJson = computed(() => {
    try {
      return JSON.stringify(reconstructExplainJson(props.data), null, 2)
    } catch (e) {
      return 'Error formatting JSON data'
    }
  })

  const exportJson = () => {
    try {
      const jsonData = JSON.stringify(reconstructExplainJson(props.data), null, 2)
      fileDownload(jsonData, 'explain-analyze-greptimedb.json', 'application/json')
      Message.success('JSON downloaded successfully')
    } catch (e) {
      Message.error(`Failed to export JSON: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Reset stage index when data changes
  watch(
    () => props.data,
    () => {
      activeStageIndex.value = 1
    }
  )
</script>

<style lang="less" scoped>
  .arco-tabs.explain-tabs {
    width: 100%;
    height: 100%;

    :deep(.arco-tabs-pane) {
      height: 100%;
      overflow: auto;
    }
    :deep(.arco-tabs-nav) {
      .arco-tabs-nav-ink {
        background-color: var(--brand-color);
      }
      .arco-tabs-tab {
        padding: 2px 0;
        &.arco-tabs-tab-active {
          color: var(--brand-color);
          font-weight: 600;
        }
      }
      &::before {
        background-color: transparent;
      }
    }

    :deep(.arco-tabs-content) {
      height: calc(100% - 28px);
      padding-top: 0;
      .arco-tabs-content-list {
        height: 100%;
      }
    }

    .arco-tabs-nav-tab-list {
      display: flex;
    }
    > .arco-tabs-content > .arco-tabs-content-list > .arco-tabs-content-item {
      padding: 0;
      height: 100%;
      overflow: hidden;
    }
  }

  .raw-json-card {
    padding: 8px 12px;
    height: 100%;
    display: flex;
    flex-direction: column;

    :deep(.arco-card-header) {
      height: 40px;
      flex-shrink: 0;
    }

    :deep(.arco-card-body) {
      flex: 1;
      min-height: 0;
      padding: 8px;
      overflow: auto;
    }

    .raw-json {
      font-size: 12px;
      margin: 0;
      white-space: pre-wrap;
    }
  }
</style>
