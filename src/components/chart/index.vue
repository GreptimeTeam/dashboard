<template>
  <VCharts v-if="renderChart" :option="options" :autoresize="autoResize" :style="{ width, height }" :theme="myTheme" />
</template>

<script lang="ts" setup>
  import { ref, nextTick } from 'vue'
  import VCharts from 'vue-echarts'
  import chartTheme from './chartTheme.json'

  defineProps({
    options: {
      type: Object,
      default() {
        return {}
      },
    },
    autoResize: {
      type: Boolean,
      default: true,
    },
    width: {
      type: String,
      default: '100%',
    },
    height: {
      type: String,
      default: '100%',
    },
  })
  const renderChart = ref(false)
  const myTheme = chartTheme
  // wait container expand
  nextTick(() => {
    renderChart.value = true
  })
</script>

<style scoped lang="less"></style>
