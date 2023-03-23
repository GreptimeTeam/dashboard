<template lang="pug">
a-tabs.result-tabs.logs-tab(type="rounded")
  template(#extra)  
    a-button.clear-logs-button(v-if="logs[routeName].length" type="secondary" status="danger" @click="clearLogs") {{$t('dataExplorer.clear')}}  
  a-tab-pane(title="Logs")
    a-card(:bordered="false")
      a-list(v-if="logs[routeName].length" :hoverable="true" size="small" :bordered="false" :split="false")
        Log(v-for="item of logs[routeName]" :key="item" :log="item" :codeType="codeType")
</template>

<script lang="ts" name="Log" setup>
  import { useLogStore } from '@/store'
  import { useClipboard } from '@vueuse/core'
  import { storeToRefs } from 'pinia'

  const { logs } = storeToRefs(useLogStore())
  const { codeType, routeName } = storeToRefs(useAppStore())

  const { clearLogs } = useLogStore()
  const { copy, copied } = useClipboard()
</script>
