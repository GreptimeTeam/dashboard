<template lang="pug">
a-list-item.smaller-divider
  a-tooltip(v-if="log.error" :content="log.error")
    a-space.log-error.last-overflow(size="mini" fill)
      template(#split)
        a-divider(direction="vertical")
      icon-close-circle.danger-color
      div {{ log.startTime }}
      div {{ $t('dataExplorer.error') }}: {{ log.error }}
  a-space.log-space.last-overflow(v-else-if="hasExecutionTime" size="mini" fill)
    template(#split)
      a-divider(direction="vertical")
    icon-check-circle.success-color
    div {{ log.startTime }}
    div(v-if="codeType === 'python'") {{ $t('dataExplorer.runScript', { name: log.codeInfo }) }}
    div {{ $tc('dataExplorer.executed', log.results.length, { length: log.results.length }) }}
    div {{ $t('dataExplorer.results') }}
      span(v-for="(oneResult, index) of log.results" :key="index") {{ oneResult.records >= 0 ? $tc('dataExplorer.select', oneResult.records, { records: oneResult.records }) : $tc('dataExplorer.affected', oneResult.affectedRows, { record: oneResult.affectedRows }) }}
    div {{ $t('dataExplorer.executeTime', { time: log.execution_time_ms }) }}
    div {{ $t('dataExplorer.network', { time: log.networkTime - log.execution_time_ms }) }}
    div {{ $t('dataExplorer.total', { time: log.networkTime }) }}
    div(v-if="codeType !== 'python'")
      a-tooltip(mini :content="copied ? $t('dataExplorer.copied') : $t('dataExplorer.copyToClipboard')")
        svg.icon.pointer.vertical-center(name="copy" @click="copyToClipboard(log.codeInfo)")
          use(href="#copy")
      a-popover
        span.code-space
          span {{ $t('dataExplorer.query') }}
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
    div {{ $t('dataExplorer.saveName', { name: log.codeInfo }) }}
</template>

<script lang="ts" name="Log" setup>
  import { useClipboard } from '@vueuse/core'
  import { format } from 'sql-formatter'

  const route = useRoute()
  const { codeType } = storeToRefs(useAppStore())
  const { copy, copied } = useClipboard()
  const props = defineProps({
    log: {
      type: Object,
      default: () => ({}),
    },
  })

  const hasExecutionTime = Reflect.has(props.log, 'execution_time_ms')

  const copyToClipboard = (code: string) => {
    if (codeType.value === 'sql') copy(format(code, { language: 'mysql', keywordCase: 'upper' }))
    else copy(code)
  }
</script>
