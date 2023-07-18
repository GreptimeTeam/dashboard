<template lang="pug">
a-list-item.smaller-divider
  a-tooltip(v-if="log.error" :content="log.error")
    a-space.log-error.last-overflow(size="mini" fill)
      template(#split)
        a-divider(direction="vertical")
      icon-close-circle.danger-color
      div {{ log.startTime }}
      div {{ $t('dashboard.error') }}: {{ log.error }}
  a-space.log-space.last-overflow(v-else-if="hasExecutionTime" size="mini" fill)
    template(#split)
      a-divider(direction="vertical")
    icon-check-circle.success-color
    div {{ log.startTime }}
    div(v-if="codeType === 'python'") {{ $t('dashboard.runScript', { name: log.codeInfo }) }}
    div {{ $tc('dashboard.executed', log.results.length, { length: log.results.length }) }}
    div {{ $t('dashboard.results') }}
      span(v-for="(oneResult, index) of log.results" :key="index") {{ oneResult.records >= 0 ? $tc('dashboard.select', oneResult.records, { records: oneResult.records }) : $tc('dashboard.affected', oneResult.affectedRows, { record: oneResult.affectedRows }) }}
    div {{ $t('dashboard.executeTime', { time: log.execution_time_ms }) }}
    div {{ $t('dashboard.network', { time: log.networkTime - log.execution_time_ms }) }}
    div {{ $t('dashboard.total', { time: log.networkTime }) }}
    a-space(v-if="codeType !== 'python'" :size="2")
      TextCopyable.log-copy(
        :data="codeFormatter(log.codeInfo)"
        :showData="false"
        :copyTooltip="$t('dashboard.copyToClipboard')"
      )
      a-popover
        span.code-space
          span {{ $t('dashboard.query') }}
          span {{ log.codeInfo }}
        template(#content)
          a-list(size="small" :split="false" :bordered="false")
            a-list-item(v-if="log.type === 'promQL'" v-for="(value, name) in log.promInfo")
              span.width-35 {{ name }}
              a-typography-text.ml-4(code) {{ value }}
            a-list-item(v-else) {{ log.codeInfo }}
  a-space.log-space(v-else size="mini" fill)
    template(#split)
      a-divider(direction="vertical")
    icon-check-circle.success-color
    div {{ log.startTime }}
    div {{ $t('dashboard.saveName', { name: log.codeInfo }) }}
</template>

<script lang="ts" name="Log" setup>
  import { format } from 'sql-formatter'

  const route = useRoute()
  const { codeType } = storeToRefs(useAppStore())
  const props = defineProps({
    log: {
      type: Object,
      default: () => ({}),
    },
  })

  const hasExecutionTime = Reflect.has(props.log, 'execution_time_ms')

  const codeFormatter = (code: string) => {
    if (codeType.value === 'sql') return format(code, { language: 'mysql', keywordCase: 'upper' })
    return code
  }
</script>
