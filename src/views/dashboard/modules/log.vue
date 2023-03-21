<template lang="pug">
a-list-item.log
  a-tooltip(v-if="log.error" :content="log.error")
    .log-error {{$t('dataExplorer.error')}}: {{log.error}}
  a-space.log-space(v-else-if="log.execution_time_ms !== undefined" size="mini" fill)
    template(#split)
      a-divider(direction="vertical")
    template(v-if="codeType==='python'") {{ $t('dataExplorer.runScript', {name: log.name}) }}
    div {{ $tc('dataExplorer.executed', log.result.length, { length: log.result.length })}}
    div {{ $t('dataExplorer.results') }}: 
      span(v-for="(oneResult, index) of log.result" :key="index") {{ oneResult.records >= 0 ? $tc('dataExplorer.select', oneResult.records, {records: oneResult.records}) : $tc('dataExplorer.affected', oneResult.affectedRows, {record: oneResult.affectedRows}) }}; 
    div {{ $t('dataExplorer.executeTime', {time: log.execution_time_ms})}}
    div {{ $t('dataExplorer.network', {time: log.networkTime - log.execution_time_ms})}}
    div {{ $t('dataExplorer.total', {time: log.networkTime}) }}
    a-tooltip(:content="log.runCode" v-if="codeType==='sql'")
      div {{ $t('dataExplorer.code', {code: log.runCode}) }}
  a-space.log-space(v-if="log.name" size="large" fill)
    template(#split)
      a-divider(direction="vertical")
    div {{ $t('dataExplorer.saveName', {name: log.name}) }}
</template>

<script lang="ts" name="Log" setup>
  import { useLogStore } from '@/store'
  import { storeToRefs } from 'pinia'

  const props = defineProps({
    log: {
      type: Object,
      default: () => ({}),
    },
    codeType: {
      type: String,
      default: 'sql',
    },
  })
</script>
