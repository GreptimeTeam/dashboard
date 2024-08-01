<template lang="pug">
a-card.logs-card(:bordered="false")
  template(#title)
    a-space
      | Logs
  template(#extra)
    a-popconfirm(
      content="Clear logs?"
      type="warning"
      ok-text="Clear"
      cancel-text=""
      @ok="clear"
    )
      a-button.clear-logs-button(
        v-if="logs.length"
        type="secondary"
        status="danger"
        size="small"
      ) {{ $t('dashboard.clear') }}
  a-list.logs-list(
    size="small"
    :hoverable="true"
    :bordered="false"
    :class="{ 'empty-list': !logs.length }"
  )
    TransitionGroup(name="list")
      Log(v-for="log of logs" :key="log" :log="log")
      EmptyStatus.empty-log(v-if="!logs.length")
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
  .arco-card.logs-card {
    height: 100%;

    :deep(.logs-list > .arco-spin > .arco-scrollbar > .arco-scrollbar-container) {
      height: var(--tables-list-height);
    }
    :deep(.arco-card-header) {
      border-bottom: 1px solid var(--border-color);
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
    justify-content: flex-end;
  }

  :deep(.arco-list-small .arco-list-content-wrapper .arco-list-content > .arco-list-item) {
    padding: 7px 10px 7px 20px;
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
