<template lang="pug">
a-tabs.result-tabs.logs-tab(type="rounded")
  template(#extra)  
    a-button.clear-logs-button(v-if="logs[routeName].length" type="secondary" status="danger" @click="clearLogs(routeName)") {{$t('dataExplorer.clear')}}  
  a-tab-pane(title="Logs")
    a-card(:bordered="false")
      a-list(v-if="logs[routeName].length" :hoverable="true" size="small" :bordered="false" :split="false")
        a-list-item(v-for="item of logs[routeName]" :key="item")
          a-tooltip(v-if="item.error" :content="item.error")
            .log-error 
              | {{ item.startTime }} 
              a-divider(direction="vertical")
              | {{$t('dataExplorer.error')}}: {{item.error}}
          a-space.log-space(v-else-if="'execution_time_ms' in item" size="mini" fill)
            template(#split)
              a-divider(direction="vertical")
            div {{ item.startTime }}
            div(v-if="codeType==='python'") {{ $t('dataExplorer.runScript', {name: item.codeInfo}) }}
            div {{ $tc('dataExplorer.executed', item.result.length, { length: item.result.length })}}
            div {{ $t('dataExplorer.results') }}: 
              span(v-for="(oneResult, index) of item.result" :key="index") {{ oneResult.records >= 0 ? $tc('dataExplorer.select', oneResult.records, {records: oneResult.records}) : $tc('dataExplorer.affected', oneResult.affectedRows, {record: oneResult.affectedRows}) }}; 
            div {{ $t('dataExplorer.executeTime', {time: item.execution_time_ms})}}
            div {{ $t('dataExplorer.network', {time: item.networkTime - item.execution_time_ms})}}
            div {{ $t('dataExplorer.total', {time: item.networkTime}) }}
            div(v-if="codeType!=='python'") 
              a-tooltip(:content="copied? $t('dataExplorer.copied') : $t('dataExplorer.copyToClipboard')" mini)
                svg.icon.pointer.vertical-center(name="copy" @click="copyToClipboard(item.codeInfo)")
                  use(href="#copy")
              a-popover
                span.code-space
                  span {{ $t('dataExplorer.query') }}
                  span {{ item.codeInfo }}
                template(#content)
                  a-list(:split="false" :bordered="false" size="small")
                    a-list-item(v-if="item.type==='promQL'" v-for="(value, name) in item.promInfo")
                      span.width-35 {{ name }}
                      a-typography-text.ml-4(code) {{ value }}
                    a-list-item(v-else) {{ item.codeInfo }}
          a-space.log-space(v-else size="large" fill)
            template(#split)
              a-divider(direction="vertical")
            div {{ $t('dataExplorer.saveName', {name: item.codeInfo}) }}
</template>

<script lang="ts" name="Log" setup>
  import { useLogStore } from '@/store'
  import { useClipboard } from '@vueuse/core'
  import { storeToRefs } from 'pinia'
  import { format } from 'sql-formatter'

  const route = useRoute()
  const { logs } = storeToRefs(useLogStore())
  const { codeType } = storeToRefs(useAppStore())
  const { clearLogs } = useLogStore()
  const { copy, copied } = useClipboard()

  const routeName = route.name
  const copyToClipboard = (code: string) => {
    if (codeType.value === 'sql') copy(format(code, { language: 'mysql', keywordCase: 'upper' }))
    else copy(code)
  }
</script>
