<template lang="pug">
a-modal.timestamp-assistance-modal(
  v-model:visible="visible"
  unmount-on-close
  :width="730"
  :footer="false"
  :mask-closable="true"
)
  template(#title)
    .time-assistance-title
      span {{ $t('dashboard.timeAssistance') }}
      .shortcut
        kbd Ctrl
        span +
        kbd Shift
        span +
        kbd ;
  .time-input-row
    .time-input-label Date & Time
    TimezoneInstantPicker.time-picker(v-model="picked" type="outline")
      template(#prefix)
        svg.icon
          use(href="#time")
    a-button.now-button(type="outline" @click="setNow")
      template(#icon)
        icon-refresh
      | Now
  table.gpt-cell-table.gpt-cell-table-hover.time-value-table
    colgroup
      col.unit-col
      col.numeric-col
      col.string-col
    thead
      tr
        th
        th Numeric Value
        th String Value
    tbody
      tr(v-for="row in timeRows" :key="row.unit")
        td.unit-cell
          span.unit-badge {{ row.unit }}
        td.value-cell.numeric-cell
          span.value-text {{ row.numeric }}
          .cell-actions
            a-button(size="mini" type="secondary" @click="act(row.numeric, 'insert')")
              template(#icon)
                icon-edit
              | {{ insertActionText }}
            a-button(size="mini" type="secondary" @click="act(row.numeric, 'copy')")
              template(#icon)
                icon-copy
              | Copy
        td.value-cell
          span.value-text {{ row.literal }}
          .cell-actions
            a-button(size="mini" type="secondary" @click="act(row.literal, 'insert')")
              template(#icon)
                icon-edit
              | {{ insertActionText }}
            a-button(size="mini" type="secondary" @click="act(row.literal, 'copy')")
              template(#icon)
                icon-copy
              | Copy
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import { Message } from '@arco-design/web-vue'
  import TimezoneInstantPicker from '@/components/time-select/instant-picker.vue'
  import { useDateTimeFormat } from '@/hooks'

  interface CMViewLike {
    state: any
    dispatch: any
    focus?: () => void
  }
  const props = defineProps<{ cm?: CMViewLike }>()

  // Use timezone-aware date formatting
  const { formatDateTime, formatDateTimeWithMs } = useDateTimeFormat()

  const visible = ref(false)
  const picked = ref<Date | null>(new Date())
  const microNanoDigits = ref<string>('000000')
  const formattedMicroNano = ref<string>('000000')

  // Trigger for forcing reactive updates
  const refreshTrigger = ref(0)

  // Check if CodeMirror has text selection
  const hasSelection = computed(() => {
    const _ = refreshTrigger.value

    const view = props.cm
    if (!view || !view.state) return false

    const selection = view.state.selection?.main
    return selection && selection.from !== selection.to
  })

  // Dynamic action text based on selection state
  const insertActionText = computed(() => {
    return hasSelection.value ? 'Replace' : 'Insert'
  })

  const refreshSelectionState = () => {
    refreshTrigger.value += 1
  }

  const insertToCM = (text: string) => {
    const view = props.cm
    if (!view) {
      console.warn('CodeMirror view not available')
      return false
    }

    try {
      const { state } = view
      if (!state) {
        console.warn('CodeMirror state not available')
        return false
      }

      const selection = state.selection?.main
      const from = selection?.from ?? 0
      const to = selection?.to ?? 0

      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
        scrollIntoView: true,
      })

      // Focus the editor after insertion
      if (typeof view.focus === 'function') {
        view.focus()
      }

      return true
    } catch (error) {
      console.error('Failed to insert text to CodeMirror:', error)
      return false
    }
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }

  // Format microsecond/nanosecond input on blur
  const onMicroNanoBlur = () => {
    const { value } = microNanoDigits
    const cleaned = value.replace(/\D/g, '')

    if (cleaned.length === 0) {
      formattedMicroNano.value = '000000'
    } else if (cleaned.length <= 3) {
      formattedMicroNano.value = `${cleaned.padEnd(3, '0')}000`
    } else if (cleaned.length <= 6) {
      formattedMicroNano.value = cleaned.padEnd(6, '0')
    } else {
      formattedMicroNano.value = cleaned.slice(0, 6)
    }

    microNanoDigits.value = formattedMicroNano.value
  }

  // Get current effective microsecond/nanosecond value
  const currentMicroNano = computed(() => {
    if (microNanoDigits.value !== formattedMicroNano.value) {
      const cleaned = microNanoDigits.value.replace(/\D/g, '').slice(0, 6).padEnd(6, '0')
      return cleaned
    }
    return formattedMicroNano.value
  })

  // Convert selected time to different timestamp formats
  const timestamp = computed(() => {
    const pickedDate = picked.value
    if (!pickedDate) return { s: '0', ms: '0', us: '0', ns: '0' }

    // Get milliseconds from Date object
    const ms = pickedDate.getTime()
    const msStr = ms.toString()
    const microDigits = currentMicroNano.value.slice(0, 3)
    const nanoDigits = currentMicroNano.value.slice(3, 6)

    return {
      s: Math.floor(ms / 1000).toString(),
      ms: msStr,
      us: msStr + microDigits,
      ns: msStr + microDigits + nanoDigits,
    }
  })

  // Generate formatted literals with different precisions (timezone-aware)
  const formatLiteral = (pickedDate: Date | null, precision: 's' | 'ms' | 'us' | 'ns' = 'ms'): string => {
    if (!pickedDate) return ''

    // Convert Date to Unix timestamp (seconds) for formatting
    const unixSeconds = Math.floor(pickedDate.getTime() / 1000)

    // Format with timezone using hook
    if (precision === 's') {
      const formatted = formatDateTime(unixSeconds, 'TimestampSecond')
      return formatted ? `'${formatted}'` : ''
    }

    // For ms, us, ns: use formatDateTimeWithMs to get base + milliseconds
    const formattedWithMs = formatDateTimeWithMs(unixSeconds, 'TimestampSecond')
    if (!formattedWithMs) return ''

    // Extract base (YYYY-MM-DD HH:mm:ss) and milliseconds (SSS)
    const parts = formattedWithMs.split('.')
    if (parts.length !== 2) return `'${formattedWithMs}'`

    const base = parts[0] // YYYY-MM-DD HH:mm:ss
    const ms = parts[1] // SSS

    const microDigits = currentMicroNano.value.slice(0, 3)
    const nanoDigits = currentMicroNano.value.slice(3, 6)

    if (precision === 'ms') return `'${base}.${ms}'`
    if (precision === 'us') return `'${base}.${ms}${microDigits}'`
    return `'${base}.${ms}${microDigits}${nanoDigits}'`
  }

  const timestampOpts = computed(() => {
    const ts = timestamp.value
    return [
      { label: `${ts.s}`, value: ts.s, unit: 's' },
      { label: `${ts.ms}`, value: ts.ms, unit: 'ms' },
      { label: `${ts.us}`, value: ts.us, unit: 'us' },
      { label: `${ts.ns}`, value: ts.ns, unit: 'ns' },
    ]
  })

  const literalOpts = computed(() => [
    { label: formatLiteral(picked.value, 's'), value: formatLiteral(picked.value, 's'), unit: 's' },
    { label: formatLiteral(picked.value, 'ms'), value: formatLiteral(picked.value, 'ms'), unit: 'ms' },
    { label: formatLiteral(picked.value, 'us'), value: formatLiteral(picked.value, 'us'), unit: 'us' },
    { label: formatLiteral(picked.value, 'ns'), value: formatLiteral(picked.value, 'ns'), unit: 'ns' },
  ])

  const timeRows = computed(() =>
    timestampOpts.value.map((option, index) => ({
      unit: option.unit,
      numeric: option.value,
      literal: literalOpts.value[index].value,
    }))
  )

  const act = (text: string, nextAction: 'insert' | 'copy') => {
    if (!text) {
      console.warn('No text to act on')
      return
    }

    if (nextAction === 'insert') {
      insertToCM(text)
    } else {
      copyText(text)
      Message.success({ content: 'Success', duration: 1000 })
    }
    visible.value = false
  }

  const setNow = () => {
    picked.value = new Date()
  }

  const open = () => {
    visible.value = true
    picked.value = new Date()
    microNanoDigits.value = '000000'
    formattedMicroNano.value = '000000'

    refreshSelectionState()
  }

  const close = () => {
    visible.value = false
  }

  defineExpose({ open, close })
</script>

<style lang="less">
  .timestamp-assistance-modal {
    .arco-modal {
      overflow: hidden;
      padding-top: 0;
      border-radius: var(--gpt-radius-md);
    }

    .arco-modal-header {
      height: 44px;
      padding: 0 20px;
      border-bottom: 1px solid var(--gpt-border-default);
    }

    .arco-modal-title {
      width: 100%;
    }

    .arco-modal-body {
      padding: 0;
    }

    .time-assistance-title {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: var(--gpt-text-primary);
      font-family: 'Gilroy';
      font-size: 16px;
      font-weight: 600;
    }

    .shortcut {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--gpt-text-muted);
      font-family: var(--font-family-base);
      font-size: 11px;
      font-weight: 600;
    }

    .shortcut kbd {
      min-width: 24px;
      height: 22px;
      padding: 0 7px;
      border: 1px solid var(--gpt-border-strong);
      border-radius: var(--gpt-radius-sm);
      background: var(--gpt-bg-header);
      color: var(--gpt-text-primary);
      font-family: var(--font-mono);
      font-size: 11px;
      line-height: 20px;
      text-align: center;
    }

    .time-input-row {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 66px;
      padding: 0 22px;
      border-bottom: 1px solid var(--gpt-border-default);
      background: var(--gpt-bg-panel);
    }

    .time-input-label {
      width: 72px;
      color: var(--gpt-text-primary);
      font-size: 12px;
      font-weight: 600;
    }

    .time-picker {
      flex: 1;
    }

    .now-button {
      width: 68px;
    }

    .time-value-table {
      th:first-child,
      td:first-child {
        padding-right: 0;
        padding-left: 20px;
      }

      tbody tr:last-child td {
        border-bottom: 0;
      }
    }

    .unit-col {
      width: 52px;
    }

    .numeric-col {
      width: 344px;
    }

    .unit-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 20px;
      padding: 0 5px;
      border-radius: var(--gpt-radius-sm);
      background: #eef1ff;
      color: #6675ff;
      font-size: 11px;
      font-weight: 600;
    }

    .value-cell {
      position: relative;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
    }

    .value-text {
      color: var(--gpt-text-primary);
    }

    .cell-actions {
      position: absolute;
      top: 50%;
      right: 12px;
      display: flex;
      gap: 4px;
      opacity: 0;
      transform: translateY(-50%);
      transition: opacity 0.12s ease;
    }

    .value-cell:hover .cell-actions {
      opacity: 1;
    }

    .cell-actions .arco-btn {
      background: rgba(71, 52, 96, 0.12);
      color: var(--gpt-text-primary);
    }
  }
</style>
