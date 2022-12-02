<template lang="pug">
a-list(:hoverable="true" size="small")
  template(#header)
    | {{$t('dataExplorer.logs')}}
  a-list-item(v-for="item of logListData" :key="item")
    a-tooltip(:content="item.error ? item.error : item.runCode")
      .log-error(v-if="item.error")
        | {{ `${$t('dataExplorer.error')}: ${item.error}` }}
      a-space(v-else size="large")
        template(#split)
          a-divider(direction="vertical")
        div {{ item.resultRows ? `${$t('dataExplorer.result')}: ${item.resultRows} ${$t('dataExplorer.rows')}` : `${$t('dataExplorer.affected')} ${item.affectedRows || 0} ${$t('dataExplorer.rows')}` }}
        div {{ `${$t('dataExplorer.executeTime')}: ${item.executeTime } ${$t('dataExplorer.ms') }`}}
        div {{ `${$t('dataExplorer.code')}: ${item.runCode} `}}
    template(#actions)
</template>

<script lang="ts" setup>
  import { storeToRefs } from 'pinia'
  import { useCodeRunStore } from '@/store'

  const codeRunStore = useCodeRunStore()
  const { logListData } = storeToRefs(codeRunStore)
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
