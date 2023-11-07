<template lang="pug">
a-card.logs-card(:bordered="false")
  template(#title)
    a-space
      | Logs
  template(#extra)
    a-button.clear-logs-button(
      v-if="logs.length"
      type="secondary"
      status="danger"
      @click="clear"
    ) {{ $t('dashboard.clear') }}
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
  .logs-card {
    height: 100%;
  }
  :deep(.arco-list) {
    border-radius: 0;
  }
  :deep(.arco-list-content) {
    border-top: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
    width: calc(100% - 32px);
    display: flex;
    flex-direction: column-reverse;
  }
  :deep(.arco-list-item:not(:last-child)) {
    border-color: var(--border-color);
  }

  :deep(.arco-list-item:last-child) {
    border-bottom: 1px solid var(--border-color);
  }

  :deep(.arco-list-item:first-child) {
    border-bottom: none;
  }
  :deep(.arco-list-item-action) {
    width: 32px;
  }

  :deep(.arco-list-item-main) {
    width: calc(100% - 32px);
  }

  :deep(.arco-list-small .arco-list-content-wrapper .arco-list-content > .arco-list-item) {
    padding: 4px 10px 4px 20px;
  }
</style>
