<template lang="pug">
a-card(:bordered="false")
  template(#title)
    img.card-icon(src="/src/assets/images/log-icon.png")
    span {{$t('dataExplorer.logs')}}
  template(#extra)  
    a-button.clear-logs-button(v-if="logs[codeType].length" type="secondary" status="danger" @click="clearLogs") {{$t('dataExplorer.clear')}}
  a-list(v-if="logs[codeType].length" :hoverable="true" size="small" :bordered="false" :split="false")
    a-list-item(v-for="item of logs[codeType]" :key="item")
      a-tooltip(:content="item.error ? item.error : item.runCode")
        .log-error(v-if="item.error") {{$t('dataExplorer.error')}}: {{item.error}}
        a-space.log-space(v-else-if="item.execution_time_ms" size="large")
          template(#split)
            a-divider(direction="vertical")
          div(v-if="codeType==='python'") {{ $t('dataExplorer.runScript', {name: item.name}) }}
          div {{ $tc('dataExplorer.executed', item.result.length, { length: item.result.length })}}
          div {{ $t('dataExplorer.results') }}: 
            span(v-for="(oneResult, index) of item.result" :key="index") {{ oneResult.records >= 0 ? $tc('dataExplorer.select', oneResult.records, {records: oneResult.records}) : $tc('dataExplorer.affected', oneResult.affectedRows, {record: oneResult.affectedRows}) }}; 
          div {{ $t('dataExplorer.executeTime', {time: item.execution_time_ms})}}
          div {{ $t('dataExplorer.network', {time: item.networkTime - item.execution_time_ms})}}
          div {{ $t('dataExplorer.total', {time: item.networkTime}) }}
          div(v-if="codeType==='sql'") {{ $t('dataExplorer.code', {code: item.runCode}) }}
        a-space.log-space(v-else size="large")
          template(#split)
            a-divider(direction="vertical")
          div {{ $t('dataExplorer.saveName', {name: item.name}) }}
</template>

<script lang="ts" name="Log" setup>
  import router from '@/router'
  import { useLogStore } from '@/store'
  import { storeToRefs } from 'pinia'

  const { logs } = storeToRefs(useLogStore())
  const { codeType } = storeToRefs(useAppStore())

  const { clearLogs } = useLogStore()
</script>
