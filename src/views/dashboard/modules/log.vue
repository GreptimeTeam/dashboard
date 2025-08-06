<template lang="pug">
a-list-item.smaller-divider
  template(v-if="hasAction && log.type !== 'python' && !log.error" #actions)
    a-button.play(type="text" size="small" @click="openEditor")
      template(#icon)
        icon-play-arrow.icon-color
  a-space(direction="vertical" fill :size="0")
    .code
      a-tooltip(v-if="log.error" position="tl" :content="log.error")
        div {{ log.error }}
      a-popover(v-else-if="log.type !== 'python'" content-class="code-popup" position="tl")
        template(#content)
          a-list(size="small" :split="false" :bordered="false")
            a-list-item(v-if="log.type === 'promql'" v-for="(value, name) in log.promInfo")
              span.width-35 {{ name }}
              a-typography-text.ml-4(code) {{ value }}
            a-list-item(v-else)
              a-typography-text.popup {{ log.codeInfo }}
        div {{ log.codeInfo }}
      .script(v-else)
        div(v-if="hasResult") {{ $t('dashboard.runScript', { name: log.codeInfo }) }}
        div(v-else) {{ $t('dashboard.saveName', { name: log.codeInfo }) }}
    a-space.info(fill)
      icon-check-circle.success-color.icon-14(v-if="!log.error")
      icon-close-circle.danger-color(v-else)
      .start-time
        | {{ log.startTime }}
      a-space.result(v-if="!log.error" fill :size="4")
        span(v-if="hasExecutionTime") {{ log.message }}
        .total-time(v-if="hasExecutionTime")
          a-popover(content-class="total-time-popover")
            template(#content)
              div {{ $t('dashboard.executeTime', { time: log.execution_time_ms }) }}
              div {{ $t('dashboard.network', { time: log.networkTime - log.execution_time_ms }) }}
            div {{ `in ${log.networkTime} ms` }}
</template>

<script lang="ts" name="Log" setup>
  const { inputFromNewLineToQueryCode, replaceCode } = useQueryCode()
  const { updateSettings } = useAppStore()

  const props = defineProps({
    log: {
      type: Object,
      default: () => ({}),
    },
    hasAction: {
      type: Boolean,
      default: true,
    },
  })

  const hasExecutionTime = computed(() => Reflect.has(props.log, 'execution_time_ms'))
  const hasResult = computed(() => Reflect.has(props.log, 'message'))

  const openEditor = () => {
    // queryType.value = props.log.type
    if (props.log.type === 'sql') {
      inputFromNewLineToQueryCode(props.log.codeInfo, 0)
    } else {
      replaceCode(props.log.codeInfo)
    }
  }
</script>

<style lang="less" scoped>
  .code {
    font-family: var(--font-mono);
    color: var(--main-font-color);
    font-size: 13px;

    div {
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
    }
  }

  .popup {
    color: var(--small-font-color);
    border: 0;
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--font-mono);
    white-space: pre-wrap;
  }

  .info {
    > :first-child {
      font-size: 14px;
    }
    font-size: 11px;
  }

  .total-time {
    background: var(--th-bg-color);
    border-radius: 4px;
    padding: 0 4px;
    min-width: max-content;
  }

  .result {
    & :deep(.arco-space-item-split) {
      margin-right: 4px !important;
    }
  }

  .play {
    font-size: 16px;
  }

  .arco-btn-text[type='button']:hover {
    .arco-btn-icon .icon-color {
      color: var(--brand-color);
    }
  }
</style>

<style lang="less">
  .total-time-popover {
    font-size: 12px;
    padding: 4px 10px;
    .arco-popover-content {
      color: var(--small-font-color);
    }
  }
</style>
