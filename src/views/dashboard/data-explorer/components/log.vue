<template lang="pug">
a-list(:hoverable="true" size="small")
  template(#header)
    span {{$t('dataExplorer.logs')}}
    a-button.clear(type="primary" size="mini" @click="clearLogs") clear
  a-list-item(v-for="item of logs" :key="item")
    a-tooltip(:content="item.error ? item.error : item.sql")
      .log-error(v-if="item.error")
        | {{ `${$t('dataExplorer.error')}: ${item.error}` }}
      a-space(v-else size="large")
        template(#split)
          a-divider(direction="vertical")
        div {{ `${$t('dataExplorer.executed')} ${item.result.length} ${$t('dataExplorer.statements')}` }}
        div {{`${$t('dataExplorer.result')}: `}}
          span(v-for="(item, index) of item.result" :key="index") {{ item.records ? `${$t('dataExplorer.select')} ${item.records} ${$t('dataExplorer.rows')}` : `${$t('dataExplorer.affected')} ${item.affectedRows} ${$t('dataExplorer.rows')} `}}
        div {{ `${$t('dataExplorer.executeTime')}: ${item.execution_time_ms } ${$t('dataExplorer.ms') }`}}
        div {{ `${$t('dataExplorer.network')}: ${item.networkTime - item.execution_time_ms } ${$t('dataExplorer.ms') }`}}
        div {{ `${$t('dataExplorer.total')}: ${item.networkTime } ${$t('dataExplorer.ms') }`}}
        div {{ `${$t('dataExplorer.code')}: ${item.sql} `}}
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
  .clear {
    float: right;
  }
</style>
