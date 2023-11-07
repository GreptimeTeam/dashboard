<template lang="pug">
a-tabs.result-tabs.logs-tab(type="rounded")
  template(#extra)
    a-button.clear-logs-button(
      v-if="logs.length"
      type="secondary"
      status="danger"
      @click="clear"
    ) {{ $t('dashboard.clear') }}
  a-tab-pane(title="Logs")
    a-card(:bordered="false")
      a-list(
        v-if="logs.length"
        size="small"
        :hoverable="true"
        :bordered="false"
      )
        Log(v-for="log of logs" :key="log" :log="log")
</template>

<script lang="ts" name="Log" setup>
  import type { Log } from '@/store/modules/log/types'
  import { storeToRefs } from 'pinia'

  const props = defineProps<{
    logs: Log[]
    types: string[]
  }>()

  const route = useRoute()
  const { clearLogs } = useLog()

  const clear = () => {
    clearLogs(props.types)
  }
</script>

<style lang="less" scoped>
  :deep(.arco-list-content) {
    border-top: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
  }
  :deep(.arco-list-item:not(:last-child)) {
    border-color: var(--border-color);
  }
</style>
