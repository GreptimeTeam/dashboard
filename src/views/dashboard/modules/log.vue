<template lang="pug">
a-list-item.log
  a-tooltip(v-if="log.error" :content="log.error")
    .log-error 
      | {{ log.startTime }} 
      a-divider(direction="vertical")
      | {{$t('dataExplorer.error')}}: {{log.error}}
  a-space.log-space(v-else-if="'execution_time_ms' in log" size="mini" fill)
    template(#split)
      a-divider(direction="vertical")
    div {{ log.startTime }}
    div(v-if="codeType==='python'") {{ $t('dataExplorer.runScript', {name: log.codeInfo}) }}
    div {{ $tc('dataExplorer.executed', log.result.length, { length: log.result.length })}}
    div {{ $t('dataExplorer.results') }}: 
      span(v-for="(oneResult, index) of log.result" :key="index") {{ oneResult.records >= 0 ? $tc('dataExplorer.select', oneResult.records, {records: oneResult.records}) : $tc('dataExplorer.affected', oneResult.affectedRows, {record: oneResult.affectedRows}) }}; 
    div {{ $t('dataExplorer.executeTime', {time: log.execution_time_ms})}}
    div {{ $t('dataExplorer.network', {time: log.networkTime - log.execution_time_ms})}}
    div {{ $t('dataExplorer.total', {time: log.networkTime}) }}
    div(v-if="codeType==='sql'") 
      a-tooltip(:content="copied? $t('dataExplorer.copied') : $t('dataExplorer.copyToClipboard')" mini)
        svg.icon.pointer.vertical-center(name="copy" @click="copyToClipboard(log.codeInfo)")
          use(href="#copy")
      span.code-space
        span {{ $t('dataExplorer.code') }}
        a-tooltip(:content="log.codeInfo")
          span {{ log.codeInfo }}
  a-space.log-space(v-else size="large" fill)
    template(#split)
      a-divider(direction="vertical")
    div {{ $t('dataExplorer.saveName', {name: log.codeInfo}) }}
</template>

<script lang="ts" name="Log" setup>
  import { useClipboard } from '@vueuse/core'
  import { format } from 'sql-formatter'

  const { copy, copied } = useClipboard()
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

  const copyToClipboard = (code: string) => {
    copy(format(code, { language: 'mysql', keywordCase: 'upper' }))
  }
</script>
