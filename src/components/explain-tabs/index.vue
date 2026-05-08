<template lang="pug">
.explain-container
  .explain-toolbar
    .view-switch
      a-tooltip(mini position="bl" :content="$t('dashboard.table')")
        a-button(
          size="mini"
          type="text"
          :class="{ active: activeView === 'table' }"
          @click="activeView = 'table'"
        )
          svg.icon-16
            use(href="#table")
      a-tooltip(mini position="bl" :content="$t('dashboard.chart')")
        a-button(
          size="mini"
          type="text"
          :class="{ active: activeView === 'chart' }"
          @click="activeView = 'chart'"
        )
          svg.icon-16
            use(href="#chart")
      a-tooltip(mini position="bl" :content="$t('dashboard.raw')")
        a-button(
          size="mini"
          type="text"
          :class="{ active: activeView === 'raw' }"
          @click="activeView = 'raw'"
        )
          | RAW
    .query-display(v-if="props.data?.query")
      a-popover(
        trigger="click"
        position="bl"
        content-class="code-tooltip"
        :content="props.data.query"
      )
        a-typography-text.query-text(code :ellipsis="{ rows: 1, css: true }") {{ props.data.query }}
      TextCopyable(
        size="mini"
        type="secondary"
        :data="props.data.query"
        :show-data="false"
        :button-text="false"
      )
    .toolbar-actions(v-if="activeView === 'raw'")
      a-space(:size="8")
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

  .explain-content
    a-space(v-if="activeView === 'table'" direction="vertical" :size="0")
      ExplainGrid(
        v-for="(stage, index) in stages"
        :key="index"
        :data="stage"
        :index="index"
      )
    ExplainChart(
      v-else-if="activeView === 'chart'"
      :data="stages[activeStageIndex]"
      :index="activeStageIndex"
      :total-stages="stages.length"
      @change-stage="activeStageIndex = $event"
    )
    .raw-json-card(v-else)
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

  const activeView = ref<'table' | 'chart' | 'raw'>('table')
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
      activeView.value = 'table'
    }
  )
</script>

<style lang="less" scoped>
  .explain-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .explain-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--color-border-2);
    padding: 0 6px;
    gap: 8px;
    min-height: 32px;

    .view-switch {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      gap: 2px;

      .arco-btn {
        color: var(--small-font-color);
      }

      .arco-btn.active {
        color: var(--brand-color);
        background: var(--color-fill-2);
      }
    }

    .toolbar-actions {
      flex-shrink: 0;
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
          color: var(--small-font-color);
          background: var(--color-neutral-2);
          border-radius: 2px;
          padding: 4px 8px;
          font-size: 11px;
        }
      }
    }
  }

  .explain-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;

    > :first-child {
      height: 100%;
      overflow: auto;
    }
  }

  .raw-json-card {
    height: 100%;
    padding: 8px 12px;
    overflow: auto;

    .raw-json {
      font-size: 12px;
      margin: 0;
      white-space: pre-wrap;
    }
  }
</style>
