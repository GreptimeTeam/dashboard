<template lang="pug">
a-list-item.smaller-divider
  template(v-if="log.type !== 'python' && !log.error" #actions)
    a-button(@click="openEditor") {{ codeType }}
  a-space(direction="vertical")
    a-space.code
      a-tooltip(v-if="log.error" :content="log.error")
        div {{ log.error }}
      a-popover(v-else-if="log.type !== 'python'")
        template(#content)
          div
            a-list(size="small" :split="false" :bordered="false")
              a-list-item(v-if="log.type === 'promql'" v-for="(value, name) in log.promInfo")
                span.width-35 {{ name }}
                a-typography-text.ml-4(code) {{ value }}
              a-list-item(v-else) {{ log.codeInfo }}
        div {{ log.codeInfo }}
      .script(v-else)
        div(v-if="hasExecutionTime") {{ $t('dashboard.runScript', { name: log.codeInfo }) }}
        div(v-else) {{ $t('dashboard.saveName', { name: log.codeInfo }) }}
    a-space.info
      icon-check-circle.success-color(v-if="!log.error")
      icon-close-circle.danger-color(v-else)
      .start-time
        | {{ log.startTime }}
      a-space.result(v-if="!log.error" :size="4")
        div(v-if="hasExecutionTime")
          span(v-for="(oneResult, index) of log.results" :key="index") {{ oneResult.records >= 0 ? $tc('dashboard.select', oneResult.records, { records: oneResult.records }) : $tc('dashboard.affected', oneResult.affectedRows, { record: oneResult.affectedRows }) }}
        .total-time(v-if="hasExecutionTime")
          a-popover
            template(#content)
              div {{ $t('dashboard.executeTime', { time: log.execution_time_ms }) }}
              div {{ $t('dashboard.network', { time: log.networkTime - log.execution_time_ms }) }}
              div {{ $t('dashboard.total', { time: log.networkTime }) }}
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
    console.log(props.log.type)

    updateSettings({ queryModalVisible: true })
    // queryType.value = props.log.type
    if (props.log.type === 'sql') {
      inputFromNewLineToQueryCode(props.log.codeInfo, 0)
    } else {
      // replaceCode(props.log.codeInfo)
    }
  }
</script>
