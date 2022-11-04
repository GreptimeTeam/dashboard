<template>
  <a-tabs default-active-key="2">
    <a-tab-pane key="1">
      <template #title> <icon-calendar /> Grid </template>
      <DataGrid />
    </a-tab-pane>
    <a-tab-pane key="2">
      <template #title> <icon-clock-circle /> Chart </template>
      <DataChart />
    </a-tab-pane>
  </a-tabs>
</template>

<script lang="ts" setup>
  import DataGrid from './components/data-grid.vue'
  import DataChart from './components/data-chart.vue'
</script>
