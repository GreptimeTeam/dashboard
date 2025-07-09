<template lang="pug">
a-card
  template(#extra)
    a-dropdown-button(size="small" type="text" @select="select")
      | {{ menuStr }}
      template(#icon)
        icon-down
      template(#content)
        a-doption(value="count") Row Count
        a-dsubmenu(trigger="hover" position="lt")
          template(#default)
            | Frequency Distribution
          template(#content)
            a-doption(v-for="field in filterFields" :value="`frequency_${field}`") {{ field }}

  CountChart(
    v-if="currChart == 'count'"
    :rows="props.rows"
    :columns="props.columns"
    :ts-column="props.tsColumn"
    :refresh-trigger="props.refreshTrigger"
    @update:rows="$emit('update:rows', $event)"
    @query="$emit('query')"
  )
  FunnelChart(v-if="currChart == 'frequency'" :key="frequencyField" :column="frequencyField")
</template>

<script setup name="ChartContainer" lang="ts">
  import { ref, computed, watch } from 'vue'
  import { storeToRefs } from 'pinia'
  import useLogsQueryStore from '@/store/modules/logs-query'
  import CountChart from './CountChart.vue'
  import FunnelChart from './FunnelChart.vue'
  import type { ColumnType, TSColumn } from './types'

  interface Props {
    columns?: ColumnType[]
    rows?: any[]
    tsColumn?: TSColumn | null
    refreshTrigger?: number
  }

  const props = withDefaults(defineProps<Props>(), {
    columns: () => [],
    rows: () => [],
    tsColumn: null,
    refreshTrigger: 0,
  })

  const emit = defineEmits(['update:rows', 'query'])

  const currChart = ref('count')
  const { currentTableName } = storeToRefs(useLogsQueryStore())
  const frequencyField = ref('')
  const filterFields = computed(() => {
    try {
      if (!props.columns || !Array.isArray(props.columns)) return []
      return props.columns
        .filter((column) => column && column.data_type === 'string')
        .map((column) => column.name)
        .filter((name) => name)
    } catch (error) {
      return []
    }
  })
  function select(action) {
    currChart.value = action.split('_')[0]
    if (currChart.value === 'frequency') {
      frequencyField.value = action.substring('frequency'.length + 1)
    }
  }
  const menuStr = computed(() => {
    if (currChart.value === 'count') {
      return 'Row Count'
    }
    return 'Frequency Distribution'
  })

  watch(currentTableName, () => {
    currChart.value = 'count'
  })
</script>

<style scoped lang="less">
  .arco-card :deep(.arco-card-header) {
    height: 18px;
    padding: 0 10px;
  }
</style>
