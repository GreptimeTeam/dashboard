<template lang="pug">
a-list-item.smaller-divider
  template(v-if="log.type !== 'python' && !log.error" #actions)
    a-button.play(type="text" @click="openEditor")
      template(#icon)
        icon-play-arrow
  a-space(direction="vertical" fill :size="0")
    .code
      a-tooltip(v-if="log.error" :content="log.error")
        div {{ log.error }}
      a-popover(v-else-if="log.type !== 'python'" content-class="code-popup")
        template(#content)
          a-list(size="small" :split="false" :bordered="false")
            a-list-item(v-if="log.type === 'promql'" v-for="(value, name) in log.promInfo")
              span.width-35 {{ name }}
              a-typography-text.ml-4(code) {{ value }}
            a-list-item(v-else)
              a-typography-text.popup {{ log.codeInfo }}
        div {{ log.codeInfo }}
      .script(v-else)
        div(v-if="hasExecutionTime") {{ $t('dashboard.runScript', { name: log.codeInfo }) }}
        div(v-else) {{ $t('dashboard.saveName', { name: log.codeInfo }) }}
    a-space.info(fill)
      icon-check-circle.success-color.icon-14(v-if="!log.error")
      icon-close-circle.danger-color(v-else)
      .start-time
        | {{ log.startTime }}
      a-space.result(v-if="!log.error" fill :size="4")
        a-space(v-if="hasExecutionTime" :size="0")
          template(#split) ;
          span(v-for="(oneResult, index) of log.results" :key="index") {{ oneResult.records >= 0 ? $tc('dashboard.select', oneResult.records, { records: oneResult.records }) : $tc('dashboard.affected', oneResult.affectedRows, { record: oneResult.affectedRows }) }}
        .total-time(v-if="hasExecutionTime")
          a-popover(content-class="total-time-popover")
            template(#content)
              div {{ $t('dashboard.executeTime', { time: log.execution_time_ms }) }}
              div {{ $t('dashboard.network', { time: log.networkTime - log.execution_time_ms }) }}
            div {{ `in ${log.networkTime} ms` }}
</template>

<script lang="ts" name="Log" setup>
  import { format } from 'sql-formatter'

  const route = useRoute()
  const { codeType: GlobalCodeType } = storeToRefs(useAppStore())
  const { inputFromNewLineToQueryCode } = useQueryCode()
  const { updateSettings } = useAppStore()

  const props = defineProps({
    log: {
      type: Object,
      default: () => ({}),
    },
    codeType: {
      type: String,
      default: 'sql',
    },
  })

  const hasExecutionTime = Reflect.has(props.log, 'execution_time_ms')

  const codeFormatter = (code: string) => {
    if ((props.codeType || GlobalCodeType.value) === 'sql')
      return format(code, { language: 'mysql', keywordCase: 'upper' })
    return code
  }

  const openEditor = () => {
    updateSettings({ queryModalVisible: true })
    // queryType.value = props.log.type
    if (props.log.type === 'sql') {
      inputFromNewLineToQueryCode(props.log.codeInfo, 0)
    } else {
      // replaceCode(props.log.codeInfo)
    }
  }
</script>

<style lang="less" scoped>
  .code {
    font-family: monospace;
    color: var(--main-font-color);
    font-size: 14px;

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
    font-family: monospace;
    white-space: pre-wrap;
  }

  .info {
    > :first-child {
      font-size: 14px;
    }
  }

  .total-time {
    background: var(--th-bg-color);
    border-radius: 4px;
    padding: 0 2px;
  }

  .result {
    & :deep(.arco-space-item-split) {
      margin-right: 4px !important;
    }
  }

  .play {
    font-size: 17px;
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
