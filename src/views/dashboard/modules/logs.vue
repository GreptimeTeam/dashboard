<template lang="pug">
.log
  a-tabs.result-tabs.logs-tab(type="rounded")
    template(#extra)  
      a-button.clear-logs-button(v-if="logs[codeType].length" type="secondary" status="danger" @click="clearLogs") {{$t('dataExplorer.clear')}}  
    a-tab-pane(title="Logs")
      a-card(:bordered="false")
        a-list(v-if="logs[codeType].length" :hoverable="true" size="small" :bordered="false" :split="false")
          Log(v-for="item of logs[codeType]" :key="item" :log="item" :codeType="codeType")
</template>

<script lang="ts" name="Logs" setup>
  import { useLogStore } from '@/store'
  import { storeToRefs } from 'pinia'
  import Log from './log.vue'

  const { logs } = storeToRefs(useLogStore())
  const { codeType } = storeToRefs(useAppStore())

  const { clearLogs } = useLogStore()
</script>
