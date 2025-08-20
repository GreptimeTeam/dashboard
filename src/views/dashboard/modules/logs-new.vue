<template lang="pug">
a-card.log(:bordered="false")
  a-list(
    size="small"
    :hoverable="true"
    :bordered="false"
    :class="{ simple: simple }"
  )
    TransitionGroup(:name="!simple ? 'list' : ''")
      a-list-item(v-for="log of logs" :key="log" :log="log")
        a-space.info(fill :size="8")
          .start-time
            | {{ log.startTime }}
          .tag
            .danger-color(v-if="log.error") [error]
            .success-color(v-else) [info]
          a-popover(
            v-if="log.error"
            position="tl"
            content-class="ingest-log-tooltip"
            :content="log.error"
          )
            div {{ log.error }}
          div(v-else-if="!simple && !log.codeTooltip && log.codeInfo")
            .code-info(v-if="log.type === 'sql' || log.type === 'promql'") {{ log.codeInfo }}
            .file-info(v-else) {{ log.codeInfo }}
          a-space(v-if="log.message" :size="3")
            | {{ log.message }}
            .total-time(v-if="!log.error")
              | {{ `in ${log.networkTime} ms` }}
          a-popover(v-if="!simple && log.codeTooltip" position="tl" content-class="code-tooltip")
            template(#content)
              div(v-if="log.type !== 'promql'") {{ log.codeTooltip }}
              a-list(
                v-else
                size="small"
                :split="false"
                :bordered="false"
              )
                a-list-item(v-for="(value, name) in log.promInfo")
                  span.width-35 {{ name }}
                  a-typography-text.ml-4(code) {{ value }}
            .code-info(v-if="log.type === 'sql' || log.type === 'promql'") {{ log.codeInfo }}
            .file-info(v-else) {{ log.codeInfo }}
</template>

<script lang="ts" name="Log" setup>
  import type { Log } from '@/store/modules/log/types'

  const props = defineProps({
    logs: {
      type: Array as PropType<Log[]>,
    },
    simple: {
      type: Boolean,
      default: false,
    },
  })
</script>

<style lang="less" scoped>
  :deep(.arco-list-content) {
    flex-direction: column-reverse;
    display: flex;
  }

  .start-time {
    font-size: 11px;
  }

  .tag {
    width: 37px;
  }

  .code-info {
    font-family: var(--font-mono);
  }

  .info {
    :deep(.arco-space-item:last-of-type) {
      overflow: hidden;
      > div {
        text-overflow: ellipsis;
        overflow: hidden;
      }
    }
  }

  .arco-card.log {
    border-radius: 0;
    background: transparent;
  }

  :deep(.arco-list-item-main) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.arco-item-main) {
    width: 100%;
  }

  :deep(.arco-list-small .arco-list-content-wrapper .arco-list-content > .arco-list-item) {
    padding: 6px 12px;
  }
  :deep(.arco-list-item) {
    border-bottom: 1px solid var(--border-color);
  }

  :deep(.arco-list-item:not(:last-child)) {
    border-color: var(--border-color);
  }
  :deep(.arco-list) {
    border-radius: 0;
    font-size: 12px;
    color: var(--main-font-color);
  }

  .total-time {
    background: var(--th-bg-color);
    border-radius: 4px;
    padding: 0 4px;
    min-width: max-content;
  }

  .list-move,
  .list-enter-active,
  .list-leave-active {
    transition: all 0.5s ease;
  }

  .list-enter-from,
  .list-leave-to {
    opacity: 0;
    transform: translateX(30px);
  }

  :deep(.simple) {
    height: 32px;
    margin-bottom: 20px;
    .arco-list-item {
      border: none;
      background: var(--danger-bg-color);
      border-radius: 4px;
    }
  }

  .file-info {
    font-weight: 600;
  }
</style>

<style lang="less">
  .ingest-log-tooltip {
    max-width: 600px;
    font-size: 13px;
    padding: 6px 10px;
  }
  .arco-popover-popup-content.code-tooltip {
    font-family: var(--font-mono);
    font-size: 13px;
    padding: 6px 10px;
    white-space: pre-wrap;
    max-width: 600px;
    word-break: break-word;
  }
</style>
