<template lang="pug">
.filter-combobox(:class="{ 'is-focused': focused }" @mousedown="handleBoxMouseDown")
  .filter-combobox__row
    DrilldownFilterPill(
      v-for="item in visibleFilterItems"
      :key="filterChipKey(item.filter, item.index)"
      :filter="item.filter"
      @edit="startEdit(item.index, 'value')"
      @edit-operator="startEdit(item.index, 'operator')"
      @edit-value="startEdit(item.index, 'value')"
      @remove="removeFilterAt(item.index)"
    )

    a-trigger.filter-combobox__editor-wrap(
      v-model:popup-visible="dropdownOpen"
      position="bl"
      :trigger="[]"
      :click-outside-to-close="false"
      :click-to-close="false"
      :blur-to-close="false"
      :popup-offset="4"
      :unmount-on-close="false"
    )
      .filter-combobox__editor
        span.filter-combobox__segment.filter-combobox__key(
          v-if="showKeyPrefix"
          @mousedown.prevent="handleKeyPrefixClick"
        ) {{ draftKey }}
        span.filter-combobox__segment.filter-combobox__op(v-if="showOpPrefix" @mousedown.prevent="handleOpPrefixClick") {{ draftOp }}
        input.filter-combobox__input(
          ref="inputRef"
          type="text"
          :value="inputValue"
          :placeholder="stagePlaceholder"
          @input="handleNativeInput"
          @focus="handleInputFocus"
          @blur="handleInputBlur"
          @keydown="handleInputKeydown"
        )

      template(#content)
        .filter-suggest-panel(v-if="showSuggestPanel")
          .filter-suggest-loading(v-if="suggestLoading")
            a-spin(size="small")
          template(v-else-if="suggestOptions.length")
            button.filter-suggest-option(
              v-for="(option, index) in suggestOptions"
              :key="`${option.value}-${index}`"
              type="button"
              :class="{ 'is-active': activeSuggestIndex === index }"
              @mousedown.prevent="selectSuggestOption(option)"
            ) {{ option.label }}
          .filter-suggest-empty(v-else) {{ labels.noSuggestions }}
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref, watch } from 'vue'
  import { useDebounceFn } from '@vueuse/core'
  import { useI18n } from 'vue-i18n'
  import { useDrilldownContext } from '@/observability/context'
  import {
    DRILLDOWN_FILTER_OP_OPTIONS,
    filterOpsForType,
    isValidFilterValue,
    normalizeFilterOp,
    normalizeCommittedFilters,
    removeFilter as removeFilterFromList,
  } from '@/observability/filters'
  import type { DrilldownFilter, DrilldownFilterOp } from '@/observability/types'
  import useDrilldownFilterOptions, { type FilterSuggestMode } from '@/observability/use-drilldown-filter-options'
  import DrilldownFilterPill from './drilldown-filter-pill.vue'

  type InputStage = 'key' | 'operator' | 'value'

  interface SuggestOption {
    label: string
    value: string
  }

  const props = withDefaults(
    defineProps<{
      /** `fields` = logs detail field filter (FIELD-key suggest only). */
      suggestMode?: FilterSuggestMode
    }>(),
    { suggestMode: 'default' }
  )

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const { filters, setFilters, appendFilter, metric, logsTable, signal, time, rangeTime, refreshKey } = ctx
  const {
    keysLoading,
    valuesLoading,
    keyOptions,
    isContainsFilterKey,
    isSqlFieldKey,
    isVisibleFilterKey,
    isFilterApplicable,
    loadKeys,
    loadValues,
    getValueOptions,
  } = useDrilldownFilterOptions(ctx, { suggestMode: props.suggestMode })

  const focused = ref(false)
  const dropdownOpen = ref(false)
  const editingIndex = ref<number | null>(null)
  const stage = ref<InputStage>('key')
  const draftKey = ref('')
  const draftOp = ref<DrilldownFilterOp>('=')
  const draftValue = ref('')
  const inputValue = ref('')
  /** Operator has been committed (value stage reached) — drives whole-segment Backspace. */
  const operatorChosen = ref(false)
  const activeSuggestIndex = ref(0)
  const ignoreBlurUntil = ref(0)
  const inputRef = ref<HTMLInputElement | null>(null)

  const isEditing = computed(() => editingIndex.value !== null)

  const sqlSignal = computed(() => signal.value === 'logs' || signal.value === 'traces')

  const labels = computed(() => ({
    wipPlaceholder: sqlSignal.value ? t('drilldown.filters.wipPlaceholderKey') : t('drilldown.filters.wipPlaceholder'),
    keyPlaceholder: sqlSignal.value
      ? t('drilldown.filters.fieldPlaceholderKey')
      : t('drilldown.filters.fieldPlaceholder'),
    operatorPlaceholder: t('drilldown.filters.operatorPlaceholder'),
    valuePlaceholder: t('drilldown.filters.valuePlaceholder'),
    noSuggestions: t('drilldown.filters.noSuggestions'),
  }))

  const activeFieldKey = computed(() => {
    if (isEditing.value && editingIndex.value !== null) {
      return filters.value[editingIndex.value]?.key ?? ''
    }
    return draftKey.value
  })

  /** Column data type of the key being edited — drives which operators are offered. */
  const activeColumnType = computed(() => ctx.signalColumnTypes.value[signal.value]?.[activeFieldKey.value.trim()])

  // Comparison operators are numeric-only, booleans get =/!=; strings keep =/!=/=~/!~.
  const operatorOptions = computed<SuggestOption[]>(() => {
    const allowed = new Set(filterOpsForType(activeColumnType.value))
    return DRILLDOWN_FILTER_OP_OPTIONS.filter((option) => allowed.has(option.value)).map((option) => ({
      label: option.label,
      value: option.value,
    }))
  })

  const sqlField = computed(() => isSqlFieldKey(activeFieldKey.value))

  const showKeyPrefix = computed(() => {
    // A committed key is always its own sub-pill chip — in both the new-filter draft and
    // editing — so Backspace at the key stage deletes the whole key/pill, never switching
    // it back to letter-by-letter text editing.
    return Boolean(draftKey.value)
  })

  const showOpPrefix = computed(() => {
    // Editing keeps the operator as its own sub-pill chip too (value + operator stages), so
    // Backspace at the operator stage deletes it wholesale instead of hiding it.
    if (isEditing.value) {
      return stage.value === 'value' || stage.value === 'operator'
    }
    return stage.value === 'value'
  })

  const stagePlaceholder = computed(() => {
    if (stage.value === 'key') {
      if (!isEditing.value && !draftKey.value && !inputValue.value) {
        return labels.value.wipPlaceholder
      }
      return labels.value.keyPlaceholder
    }
    if (stage.value === 'operator') {
      return labels.value.operatorPlaceholder
    }
    return labels.value.valuePlaceholder
  })

  const showSuggestPanel = computed(() => {
    if (stage.value === 'key' || stage.value === 'operator') {
      return true
    }
    return stage.value === 'value' && sqlField.value
  })

  const suggestLoading = computed(() => {
    if (stage.value === 'key') {
      return keysLoading.value
    }
    if (stage.value === 'value' && sqlField.value) {
      return valuesLoading.value
    }
    return false
  })

  const suggestOptions = computed(() => {
    const query = inputValue.value.trim().toLowerCase()

    if (stage.value === 'key') {
      const options = keyOptions.value.map((value) => ({ label: value, value }))
      if (!query) {
        return options
      }
      return options.filter((option) => option.label.toLowerCase().includes(query))
    }

    if (stage.value === 'operator') {
      if (!query) {
        return operatorOptions.value
      }
      return operatorOptions.value.filter(
        (option) => option.label.includes(query) || option.value.toLowerCase().includes(query)
      )
    }

    if (stage.value === 'value' && sqlField.value) {
      const options = getValueOptions(activeFieldKey.value).map((value) => ({ label: value, value }))
      if (!query) {
        return options
      }
      return options.filter((option) => option.label.toLowerCase().includes(query))
    }

    return []
  })

  const visibleFilterItems = computed(() =>
    filters.value
      .map((filter, index) => ({ filter, index }))
      .filter(
        (item) =>
          editingIndex.value !== item.index &&
          isVisibleFilterKey(item.filter.key) &&
          // Not applicable to this signal's table: hidden here, kept in the shared state so
          // switching back to a signal that supports it shows it again.
          isFilterApplicable(item.filter.key)
      )
  )

  const filterChipKey = (filter: DrilldownFilter, index: number) =>
    `${filter.key}\0${filter.op}\0${filter.value}\0${index}`

  const focusInput = async () => {
    await nextTick()
    inputRef.value?.focus()
  }

  const openSuggest = () => {
    if (!showSuggestPanel.value) {
      dropdownOpen.value = false
      return
    }
    dropdownOpen.value = true
    activeSuggestIndex.value = 0
  }

  const deferIgnoreBlur = (duration = 250) => {
    ignoreBlurUntil.value = Date.now() + duration
  }

  const resetWip = () => {
    if (isEditing.value) {
      return
    }
    operatorChosen.value = false
    stage.value = 'key'
    draftKey.value = ''
    draftOp.value = '='
    draftValue.value = ''
    inputValue.value = ''
    dropdownOpen.value = false
    activeSuggestIndex.value = 0
  }

  const clearEdit = () => {
    editingIndex.value = null
    resetWip()
  }

  const prepareWipForNextFilter = async () => {
    editingIndex.value = null
    operatorChosen.value = false
    stage.value = 'key'
    draftKey.value = ''
    draftOp.value = '='
    draftValue.value = ''
    inputValue.value = ''
    activeSuggestIndex.value = 0
    deferIgnoreBlur(500)
    focused.value = true
    await loadKeys()
    await focusInput()
    openSuggest()
  }

  const syncInputForStage = () => {
    if (stage.value === 'value') {
      inputValue.value = draftValue.value
      return
    }
    inputValue.value = ''
  }

  const startEdit = (index: number, focus: 'operator' | 'value') => {
    const filter = filters.value[index]
    if (!filter) {
      return
    }
    editingIndex.value = index
    operatorChosen.value = true
    draftKey.value = filter.key
    draftOp.value = filter.op
    draftValue.value = filter.value
    stage.value = focus
    syncInputForStage()
    if (focus === 'value' && isSqlFieldKey(filter.key)) {
      loadValues(filter.key)
    }
    deferIgnoreBlur()
    focusInput()
    openSuggest()
  }

  const removeFilterAt = (index: number) => {
    setFilters(removeFilterFromList(filters.value, index))
    if (editingIndex.value === index) {
      clearEdit()
    } else if (editingIndex.value !== null && editingIndex.value > index) {
      editingIndex.value -= 1
    }
  }

  const commitDraft = async () => {
    const key = draftKey.value.trim()
    const value = draftValue.value.trim()
    if (!key || !value) {
      return
    }
    // Numeric/boolean columns only accept renderable values; an operator that does not apply
    // to the column type (e.g. carried in a URL) falls back to `=`.
    const dataType = ctx.signalColumnTypes.value[signal.value]?.[key]
    if (!isValidFilterValue(dataType, value)) {
      return
    }
    const op = normalizeFilterOp(dataType, draftOp.value)
    if (props.suggestMode === 'fields' && !ctx.fieldMap.value.logs[key]) {
      ctx.fieldMap.value = {
        ...ctx.fieldMap.value,
        logs: { ...ctx.fieldMap.value.logs, [key]: key },
      }
    }
    const filter: DrilldownFilter = { key, op, value }
    if (isEditing.value && editingIndex.value !== null) {
      const updated = filters.value.map((item, itemIndex) => (itemIndex === editingIndex.value ? filter : item))
      setFilters(normalizeCommittedFilters(updated))
    } else {
      appendFilter(filter)
    }
    await prepareWipForNextFilter()
  }

  const advanceToOperator = () => {
    operatorChosen.value = false
    stage.value = 'operator'
    syncInputForStage()
    deferIgnoreBlur()
    focusInput()
    openSuggest()
  }

  const advanceToValue = () => {
    operatorChosen.value = true
    stage.value = 'value'
    syncInputForStage()
    if (sqlField.value) {
      loadValues(draftKey.value)
    }
    deferIgnoreBlur()
    focusInput()
    openSuggest()
  }

  const defaultOpForKey = (key: string): DrilldownFilterOp => {
    if (signal.value === 'logs' && isContainsFilterKey(key)) {
      return '=~'
    }
    return '='
  }

  const selectSuggestOption = (option: SuggestOption) => {
    if (stage.value === 'key') {
      draftKey.value = option.value
      draftOp.value = defaultOpForKey(option.value)
      advanceToOperator()
      return
    }
    if (stage.value === 'operator') {
      draftOp.value = option.value as DrilldownFilterOp
      advanceToValue()
      return
    }
    if (stage.value === 'value') {
      draftValue.value = option.value
      inputValue.value = option.value
      commitDraft()
    }
  }

  const commitStageFromInput = () => {
    if (stage.value === 'key') {
      const trimmed = inputValue.value.trim()
      if (!trimmed) {
        return false
      }
      draftKey.value = trimmed
      draftOp.value = defaultOpForKey(trimmed)
      advanceToOperator()
      return true
    }
    if (stage.value === 'operator') {
      const trimmed = inputValue.value.trim()
      const matched =
        operatorOptions.value.find((option) => option.value === trimmed) ??
        operatorOptions.value.find((option) => option.label === trimmed)
      if (matched) {
        draftOp.value = matched.value as DrilldownFilterOp
      } else if (trimmed) {
        return false
      }
      advanceToValue()
      return true
    }
    if (stage.value === 'value') {
      draftValue.value = inputValue.value.trim()
      if (draftValue.value) {
        commitDraft()
        return true
      }
    }
    return false
  }

  const handleKeyPrefixClick = () => {
    stage.value = 'key'
    inputValue.value = draftKey.value
    // Clicking the key chip re-opens it as editable text (chip hides while editing).
    draftKey.value = ''
    deferIgnoreBlur()
    focusInput()
    openSuggest()
  }

  const handleOpPrefixClick = () => {
    stage.value = 'operator'
    syncInputForStage()
    deferIgnoreBlur()
    focusInput()
    openSuggest()
  }

  const handleInputChange = () => {
    if (stage.value === 'value') {
      draftValue.value = inputValue.value
    }
    activeSuggestIndex.value = 0
    openSuggest()
  }

  const handleNativeInput = (event: Event) => {
    const target = event.target as HTMLInputElement
    inputValue.value = target.value
    handleInputChange()
  }

  const handleInputFocus = () => {
    focused.value = true
    deferIgnoreBlur()
    openSuggest()
  }

  const handleInputBlur = useDebounceFn(() => {
    if (Date.now() < ignoreBlurUntil.value) {
      return
    }
    focused.value = false
    dropdownOpen.value = false

    if (stage.value === 'value') {
      const key = draftKey.value.trim()
      const value = draftValue.value.trim()
      if (key && value) {
        commitDraft()
        return
      }
      if (isEditing.value) {
        clearEdit()
      } else {
        resetWip()
      }
      return
    }

    if (isEditing.value) {
      clearEdit()
      return
    }
    resetWip()
  }, 120)

  const retreatToKey = () => {
    operatorChosen.value = false
    stage.value = 'key'
    draftOp.value = '='
    // Keep the key as a sub-pill chip (input stays empty) in both flows, so the next
    // Backspace deletes the whole key/pill instead of switching to letter-by-letter text.
    inputValue.value = ''
    deferIgnoreBlur()
    focusInput()
    openSuggest()
  }

  const handleBackspaceInput = (event: KeyboardEvent) => {
    if (event.key !== 'Backspace' || inputValue.value !== '') {
      return
    }

    event.preventDefault()

    if (stage.value === 'value') {
      // A pill is key | operator | value sub-pills, each deleted with one Backspace. When
      // the value input is empty, the next Backspace deletes the whole operator (not just
      // an intermediate "operator stage") so operator then key each take exactly one press.
      retreatToKey()
      return
    }

    if (stage.value === 'operator') {
      if (operatorChosen.value) {
        retreatToKey()
      } else {
        // Just committed the key, operator not chosen yet — one Backspace deletes the
        // whole key directly instead of first retreating to the key stage.
        draftKey.value = ''
        draftOp.value = '='
        stage.value = 'key'
        inputValue.value = ''
        deferIgnoreBlur()
        focusInput()
        openSuggest()
      }
      return
    }

    if (isEditing.value && editingIndex.value !== null) {
      removeFilterAt(editingIndex.value)
      prepareWipForNextFilter()
      return
    }

    // New-filter draft with a committed key chip: Backspace deletes the whole key, back to
    // an empty key stage (a filter needs a key, so there is nothing before it to retreat to).
    if (stage.value === 'key' && draftKey.value) {
      draftKey.value = ''
      draftOp.value = '='
      deferIgnoreBlur()
      focusInput()
      openSuggest()
      return
    }

    if (filters.value.length > 0) {
      removeFilterAt(filters.value.length - 1)
      deferIgnoreBlur()
      focusInput()
      openSuggest()
      return
    }

    resetWip()
  }

  const handleInputKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Backspace') {
      handleBackspaceInput(event)
      if (event.defaultPrevented) {
        return
      }
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!suggestOptions.value.length) {
        return
      }
      activeSuggestIndex.value = Math.min(activeSuggestIndex.value + 1, suggestOptions.value.length - 1)
      dropdownOpen.value = true
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      activeSuggestIndex.value = Math.max(activeSuggestIndex.value - 1, 0)
      dropdownOpen.value = true
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (dropdownOpen.value && suggestOptions.value[activeSuggestIndex.value]) {
        selectSuggestOption(suggestOptions.value[activeSuggestIndex.value])
        return
      }
      commitStageFromInput()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      dropdownOpen.value = false
      if (isEditing.value) {
        clearEdit()
      } else {
        resetWip()
      }
    }
  }

  const handleKeySearch = useDebounceFn((value: string) => {
    loadKeys(value)
  }, 250)

  const handleValueSearch = useDebounceFn((value: string) => {
    if (isSqlFieldKey(activeFieldKey.value)) {
      loadValues(activeFieldKey.value, value)
    }
  }, 250)

  const handleBoxMouseDown = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    if (target.closest('.filter-pill') || target.closest('.filter-suggest-panel')) {
      return
    }
    if (target.closest('.filter-combobox__input')) {
      deferIgnoreBlur()
      return
    }
    deferIgnoreBlur()
    focusInput()
  }

  watch(inputValue, (value) => {
    if (stage.value === 'key') {
      handleKeySearch(value)
    } else if (stage.value === 'value' && sqlField.value) {
      handleValueSearch(value)
    }
  })

  watch(
    () => [
      signal.value,
      metric.value,
      logsTable.value,
      time.value,
      rangeTime.value[0],
      rangeTime.value[1],
      refreshKey.value,
    ],
    () => {
      loadKeys()
    }
  )

  onMounted(() => {
    loadKeys()
  })
</script>

<style scoped lang="less">
  .filter-combobox {
    display: inline-flex;
    box-sizing: border-box;
    align-items: center;
    flex: 0 1 auto;
    width: max-content;
    max-width: 100%;
    min-width: 200px;
    min-height: var(--gpt-control-height-md);
    padding: 0 var(--gpt-gap-md);
    border: 1px solid var(--gpt-editor-border);
    border-radius: var(--gpt-radius-sm);
    background: var(--gpt-bg-panel);
    cursor: text;
    vertical-align: middle;
    transition: border-color 0.15s;
  }

  .filter-combobox__row {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--gpt-gap-xs);
    width: max-content;
    max-width: 100%;
    min-height: calc(var(--gpt-control-height-md) - 2px);
  }

  .filter-combobox__editor-wrap {
    flex: 0 1 auto;
    min-width: 0;
    width: auto;
  }

  .filter-combobox__editor {
    display: inline-flex;
    align-items: center;
    height: calc(var(--gpt-control-height-md) - 2px);
    min-height: 0;
    min-width: 0;
    gap: var(--gpt-gap-2xs);
  }

  .filter-combobox__segment {
    padding: 0 var(--gpt-gap-2xs);
    font-size: var(--gpt-font-base);
    line-height: calc(var(--gpt-control-height-md) - 2px);
    white-space: nowrap;
    cursor: pointer;
    color: var(--gpt-text-secondary);

    &:hover {
      color: var(--gpt-main-purple);
    }
  }

  .filter-combobox__key {
    color: var(--gpt-text-primary);
    font-weight: var(--gpt-font-weight-control);
  }

  .filter-combobox__input {
    flex: 0 1 auto;
    width: 120px;
    min-width: 120px;
    height: calc(var(--gpt-control-height-md) - 2px);
    margin: 0;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: var(--gpt-font-base);
    line-height: calc(var(--gpt-control-height-md) - 2px);
    color: var(--gpt-text-primary);

    @supports (field-sizing: content) {
      width: auto;
      min-width: 120px;
      field-sizing: content;
    }

    &::placeholder {
      color: var(--gpt-placeholder-color);
    }

    &:focus {
      outline: none;
    }
  }

  .filter-suggest-panel {
    min-width: max(220px, 100%);
    max-width: 420px;
    max-height: 240px;
    overflow-y: auto;
    padding: var(--gpt-gap-xs);
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-sm);
    background: var(--gpt-bg-panel);
    box-shadow: var(--gpt-shadow-sm);
  }

  .filter-suggest-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--gpt-gap-md);
  }

  .filter-suggest-empty {
    padding: var(--gpt-gap-md) var(--gpt-gap-md);
    font-size: var(--gpt-font-base);
    line-height: 1.4;
    color: var(--gpt-text-secondary);
  }

  .filter-suggest-option {
    display: block;
    width: 100%;
    padding: var(--gpt-gap-sm) var(--gpt-gap-md);
    border: none;
    border-radius: var(--gpt-radius-sm);
    background: transparent;
    color: var(--gpt-text-primary);
    font-size: var(--gpt-font-base);
    line-height: 1.4;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: var(--list-hover-color);
    }

    // 与全局 select 下拉一致（global.less .arco-select-dropdown）：中性 tint 底色、
    // 文字保持主色；键盘 active 项加 semibold。紫色文字仅用于导航/选中 chip。
    &.is-active {
      background: var(--list-hover-color);
      font-weight: var(--gpt-font-weight-control);
    }
  }
</style>
