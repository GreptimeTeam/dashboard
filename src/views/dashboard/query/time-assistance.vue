<template lang="pug">
a-modal.timestamp-assistance-modal(
  v-model:visible="visible"
  unmount-on-close
  :width="640"
  :footer="false"
  :mask-closable="true"
)
  template(#title)
    a-space
      span 🕒 {{ $t('dashboard.timeAssistance') }}
      a-tag(size="small" color="blue") Ctrl+Shift+;
  a-space(direction="vertical" fill :size="16")
    a-space
      a-date-picker.timestamp(
        v-model="picked"
        show-time
        format="YYYY-MM-DD HH:mm:ss.SSS"
        value-format="YYYY-MM-DD HH:mm:ss.SSS"
        style="width: 210px"
        type="outline"
        :allow-clear="false"
      )
        template(#prefix)
          svg.icon-16
            use(href="#time")
      a-input.digits(
        v-model="microNanoDigits"
        placeholder="000000"
        maxlength="6"
        @blur="onMicroNanoBlur"
      )
        template(#suffix)
          span µs/ns
    a-space.action(align="center")
      span.section-subtitle Action:
      a-radio-group(v-model="action" type="button" size="small")
        a-radio(value="insert")
          span ↗️ {{ insertActionText }}
        a-radio(value="copy")
          span 📋 Copy
    a-space.option(align="start" fill :size="32")
      a-space(direction="vertical" fill :size="8")
        .section-subtitle Timestamp
        a-radio-group(v-model="chosen" type="button" @change="onChoose")
          a-space(direction="vertical" fill :size="4")
            a-radio(v-for="opt in timestampOpts" :key="opt.value" :value="opt.value") {{ opt.label }}
      a-space(direction="vertical" fill :size="8")
        .section-subtitle Formatted
        a-radio-group(v-model="chosen" type="button" @change="onChoose")
          a-space(direction="vertical" fill :size="4")
            a-radio(v-for="opt in literalOpts" :key="opt.value" :value="opt.value") {{ opt.label }}
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'

  interface CMViewLike {
    state: any
    dispatch: any
  }
  const props = defineProps<{ cm?: CMViewLike }>()

  const visible = ref(false)
  const picked = ref<string | undefined>(dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'))
  const action = ref<'insert' | 'copy'>('insert')
  const chosen = ref<string>('')
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

      console.log('Text inserted successfully:', text)
      return true
    } catch (error) {
      console.error('Failed to insert text to CodeMirror:', error)
      return false
    }
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      console.log('Text copied to clipboard:', text)
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
    const pickedStr = picked.value
    if (!pickedStr) return { s: '0', ms: '0', us: '0', ns: '0' }

    const d = dayjs(pickedStr, 'YYYY-MM-DD HH:mm:ss.SSS', true)
    if (!d.isValid()) return { s: '0', ms: '0', us: '0', ns: '0' }

    const ms = d.valueOf()
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

  // Generate formatted literals with different precisions
  const formatLiteral = (pickedStr?: string, precision: 's' | 'ms' | 'us' | 'ns' = 'ms'): string => {
    if (!pickedStr) return ''

    const d = dayjs(pickedStr, 'YYYY-MM-DD HH:mm:ss.SSS', true)
    if (!d.isValid()) return ''

    const base = d.format('YYYY-MM-DD HH:mm:ss')
    const ms = d.format('SSS')
    const microDigits = currentMicroNano.value.slice(0, 3)
    const nanoDigits = currentMicroNano.value.slice(3, 6)

    if (precision === 's') return `'${base}'`
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

  const act = (text: string) => {
    if (!text) {
      console.warn('No text to act on')
      return
    }

    console.log('Acting on text:', text, 'Action:', action.value)

    if (action.value === 'insert') {
      const done = insertToCM(text)
      if (!done) {
        console.log('Insert failed, falling back to copy')
        copyText(text)
      }
    } else {
      copyText(text)
    }
    visible.value = false
  }

  const onChoose = () => {
    const v = chosen.value
    console.log('onChoose called with value:', v)
    if (!v) {
      console.warn('No value chosen')
      return
    }
    act(v)
  }

  const open = () => {
    visible.value = true
    picked.value = dayjs().format('YYYY-MM-DD HH:mm:ss.SSS')
    chosen.value = ''
    microNanoDigits.value = '000000'
    formattedMicroNano.value = '000000'

    refreshSelectionState()

    console.log('Time assistance opened, CodeMirror available:', !!props.cm)
    if (props.cm) {
      console.log('CodeMirror state:', !!props.cm.state)
      const selection = props.cm.state?.selection?.main
      console.log('Current selection:', selection?.from, 'to', selection?.to, 'hasSelection:', hasSelection.value)
    }
  }

  const close = () => {
    visible.value = false
  }

  defineExpose({ open, close })
</script>

<style lang="less" scoped>
  .section-subtitle {
    font-size: 12px;
  }
</style>

<style lang="less">
  .timestamp-assistance-modal {
    .arco-picker.timestamp {
      padding: 0 0 0 10px;
      width: 100%;
      .arco-picker-suffix-icon {
        display: none;
      }
    }
    .arco-input-wrapper.digits {
      width: 110px;
      .arco-input-suffix {
        font-size: 11px;
        padding-left: 0;
      }
    }
    .action {
      padding-left: 4px;
    }
    .option {
      padding-left: 4px;
    }
  }
</style>
