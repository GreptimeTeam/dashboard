<template lang="pug">
a-card(:bordered="false")
  a-list(size="small" :hoverable="true" :bordered="false")
    a-list-item(v-for="log of logs" :key="log" :log="log")
      a-space.info(fill)
        icon-check-circle.success-color.icon-14(v-if="!log.error")
        icon-close-circle.danger-color(v-else)
        .start-time
          | {{ log.startTime }}
        div(v-if="log.codeInfo") {{ log.codeInfo }}
        div(v-if="log.message") {{ log.message }}
        .total-time(v-if="!log.error")
          div {{ `in ${log.networkTime} ms` }}
        div(v-if="log.error") {{ log.error }}
</template>

<script lang="ts" name="Log" setup>
  import type { Log } from '@/store/modules/log/types'

  const props = defineProps<{
    logs: Log[]
    types: string[]
  }>()

  const { clearLogs } = useLog()

  const clear = () => {
    clearLogs(props.types)
  }
</script>

<style lang="less" scoped>
  :deep(.arco-list-content) {
    border-top: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
    flex-direction: column-reverse;
    display: flex;
  }

  :deep(.arco-list-small .arco-list-content-wrapper .arco-list-content > .arco-list-item) {
    padding: 4px 12px;
  }
  :deep(.arco-list-item:last-child) {
    border-bottom: 1px solid var(--border-color);
  }
  :deep(.arco-list-item:first-child) {
    border-bottom: none;
  }

  :deep(.arco-list-item:not(:last-child)) {
    border-color: var(--border-color);
  }
  :deep(.arco-list) {
    border-radius: 0;
  }

  .total-time {
    background: var(--th-bg-color);
    border-radius: 4px;
    padding: 0 4px;
    min-width: max-content;
  }
</style>
