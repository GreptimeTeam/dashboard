<template lang="pug">
a-tabs.result-tabs.logs-tab(type="rounded")
  template(#extra)  
    a-button.clear-logs-button(v-if="logs.length" type="secondary" status="danger" @click="clear(route.name)") {{$t('dataExplorer.clear')}}  
  a-tab-pane(title="Logs")
    a-card(:bordered="false")
      a-list(v-if="logsByType.length" :hoverable="true" size="small" :bordered="false" :split="false")
        Log(v-for="item of logsByType" :key="item" :log="item" :codeType="codeType")
</template>

<script lang="ts" name="Log" setup>
  import { useLogStore } from '@/store'
  import { useClipboard } from '@vueuse/core'
  import { storeToRefs } from 'pinia'

  const route = useRoute()
  const { codeType } = storeToRefs(useAppStore())
  const { logs } = useLogStore()
  const { copy, copied } = useClipboard()

  const logsByType = computed(() => logs?.filter((l) => l.type === route.name))
</script>
