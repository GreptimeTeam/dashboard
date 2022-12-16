<template lang="pug">
a-card
  template(#title)
    svg.card-icon
      use(href="#table")
    span {{$t('dataExplorer.logs')}}
  template(#extra)
    a-button(type="primary" @click="clearLogs") {{$t('dataExplorer.clear')}}
  a-list(:hoverable="true" size="small")
    a-list-item(v-for="item of logs" :key="item")
      a-tooltip(:content="item.error ? item.error : item.sql")
        .log-error(v-if="item.error")
          | {{ `${$t('dataExplorer.error')}: ${item.error}` }}
        a-space(v-else size="large")
          template(#split)
            a-divider(direction="vertical")
          div {{ item.affectedrows ? `${$t('dataExplorer.affected')} ${item.affectedrows || 0} ${$t('dataExplorer.rows')}` : `${$t('dataExplorer.result')}: ${item.records.rows.length} ${$t('dataExplorer.rows')}`}}
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
</style>
