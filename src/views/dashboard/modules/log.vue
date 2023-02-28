<template lang="pug">
a-tabs.result-tabs.logs-tab(type="rounded")
  template(#extra)  
    a-button.clear-logs-button(v-if="logs[codeType].length" type="secondary" status="danger" @click="clearLogs") {{$t('dataExplorer.clear')}}  
  a-tab-pane(title="Logs")
    a-card(:bordered="false")
      a-list(v-if="logs[codeType].length" :hoverable="true" size="small" :bordered="false" :split="false")
        a-list-item(v-for="item of logs[codeType]" :key="item")
          a-tooltip(v-if="item.error" :content="item.error")
            .log-error {{$t('dataExplorer.error')}}: {{item.error}}
          a-space.log-space(v-else-if="item.execution_time_ms" size="mini" fill)
            template(#split)
              a-divider(direction="vertical")
            div(v-if="codeType==='python'") {{ $t('dataExplorer.runScript', {name: item.name}) }}
            div {{ $tc('dataExplorer.executed', item.result.length, { length: item.result.length })}}
            div {{ $t('dataExplorer.results') }}: 
              span(v-for="(oneResult, index) of item.result" :key="index") {{ oneResult.records >= 0 ? $tc('dataExplorer.select', oneResult.records, {records: oneResult.records}) : $tc('dataExplorer.affected', oneResult.affectedRows, {record: oneResult.affectedRows}) }}; 
            div {{ $t('dataExplorer.executeTime', {time: item.execution_time_ms})}}
            div {{ $t('dataExplorer.network', {time: item.networkTime - item.execution_time_ms})}}
            div {{ $t('dataExplorer.total', {time: item.networkTime}) }}
            a-tooltip(:content="item.runCode" v-if="codeType==='sql'")
              div {{ $t('dataExplorer.code', {code: item.runCode}) }}
          a-space.log-space(v-else size="large" fill)
            template(#split)
              a-divider(direction="vertical")
            div {{ $t('dataExplorer.saveName', {name: item.name}) }}
</template>

<script lang="ts" name="Log" setup>
  import { useLogStore } from '@/store'
  import { storeToRefs } from 'pinia'

  const { logs } = storeToRefs(useLogStore())
  const { codeType } = storeToRefs(useAppStore())

  const { clearLogs } = useLogStore()
</script>
