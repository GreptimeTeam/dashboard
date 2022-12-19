<template lang="pug">
a-card
  template(#title)
    svg.card-icon
      use(href="#table")
    span {{$t('dataExplorer.logs')}}
  template(#extra)  
    a-button(type="primary" size="mini" @click="clearLogs") {{$t('dataExplorer.clear')}}
  a-list(:hoverable="true" size="small")
    a-list-item(v-for="item of logs" :key="item")
      a-tooltip(:content="item.error ? item.error : item.sql")
        .log-error(v-if="item.error") {{$t('dataExplorer.error')}}: {{item.error}}
        a-space(v-else size="large")
          template(#split)
            a-divider(direction="vertical")
          div {{ $tc('dataExplorer.executed', item.result.length, { length:item.result.length })}}
          div {{ $t('dataExplorer.results') }}: 
            span(v-for="(oneResult, index) of item.result" :key="index") {{ oneResult.records >= 0 ? $tc('dataExplorer.select', oneResult.records, {records: oneResult.records}) : $tc('dataExplorer.affected', oneResult.affectedRows, {record: oneResult.affectedRows}) }}; 
          div {{ $t('dataExplorer.executeTime', {time: item.execution_time_ms})}}
          div {{ $t('dataExplorer.network', {time: item.networkTime - item.execution_time_ms})}}
          div {{ $t('dataExplorer.total', {time: item.networkTime}) }}
          div {{ $t('dataExplorer.code', {sql: item.sql}) }}
    template(#actions)
</template>

<script lang="ts" setup>
  import { storeToRefs } from 'pinia'

  const { logs } = storeToRefs(useLogStore())
  const { clearLogs } = useLogStore()
</script>

<style scoped>
  .log-error {
    background-color: var(--color-danger-light-1);
    padding: 0 2px;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }
  :deep(.arco-list-item-main) {
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }
</style>
