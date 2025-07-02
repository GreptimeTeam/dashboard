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

  CountChart(v-if="currChart == 'count'")
  FunnelChart(v-if="currChart == 'frequency'" :key="frequencyField" :column="frequencyField")
</template>

<script setup name="ChartContainer" lang="ts">
  import useLogsQueryStore from '@/store/modules/logs-query'
  import CountChart from './CountChart.vue'
  import FunnelChart from './FunnelChart.vue'

  const currChart = ref('count')
  const { columns, inputTableName } = storeToRefs(useLogsQueryStore())
  const frequencyField = ref('')
  const filterFields = computed(() =>
    columns.value.filter((column) => column.data_type === 'string').map((column) => column.name)
  )
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

  watch(inputTableName, () => {
    currChart.value = 'count'
  })
</script>

<style scoped lang="less">
  .arco-card :deep(.arco-card-header) {
    height: 18px;
    padding: 0 10px;
  }
</style>
