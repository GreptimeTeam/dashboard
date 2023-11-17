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
    size="small"
    :hoverable="true"
    :bordered="false"
    :class="{ 'empty-list': !logs.length }"
  )
    TransitionGroup(name="list")
      Log(v-for="log of logs" :key="log" :log="log")
    template(#empty)
      EmptyStatus.empty-log
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
    :deep(.arco-card-header-title) {
      font-weight: 800;
    }
  }
  .empty-list {
    :deep(.arco-list-content) {
      border: none;
    }
  }
  :deep(.arco-list) {
    border-radius: 0;
  }

  :deep(.arco-list-content) {
    border-top: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    flex-direction: column-reverse;
  }

  :deep(.arco-list-item-main) {
    width: calc(100% - 32px);
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

  :deep(.arco-list-small .arco-list-content-wrapper .arco-list-content > .arco-list-item) {
    padding: 4px 10px 4px 20px;
  }

  .arco-list-hover .arco-list-item:hover {
    background-color: var(--light-brand-color);
  }

  .empty-log {
    border: none;
    flex-direction: column;
    height: 50vh;
  }

  .list-enter-active,
  .list-leave-active {
    transition: all 0.5s ease;
  }
  .list-enter-from,
  .list-leave-to {
    opacity: 0;
    transform: translateX(30px);
  }
</style>
