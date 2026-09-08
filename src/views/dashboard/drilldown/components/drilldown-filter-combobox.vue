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
          :class="{ 'is-readonly': isEditing && stage !== 'key' }"
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
    normalizeCommittedFilters,
    removeFilter as removeFilterFromList,
  } from '@/observability/filters'
  import useDrilldownFilterOptions from '@/observability/use-drilldown-filter-options'
  import type { DrilldownFilter, DrilldownFilterOp } from '@/observability/types'
  import DrilldownFilterPill from './drilldown-filter-pill.vue'

  type InputStage = 'key' | 'operator' | 'value'

  interface SuggestOption {
    label: string
    value: string
  }

  const { t } = useI18n()
  const ctx = useDrilldownContext()
  const { filters, setFilters, appendFilter, metric, logsTable, time, rangeTime, refreshKey } = ctx
  const { keysLoading, valuesLoading, keyOptions, isSqlFieldKey, loadKeys, loadValues, getValueOptions } =
    useDrilldownFilterOptions(ctx)

  const focused = ref(false)
  const dropdownOpen = ref(false)
  const editingIndex = ref<number | null>(null)
  const stage = ref<InputStage>('key')
  const draftKey = ref('')
  const draftOp = ref<DrilldownFilterOp>('=')
  const draftValue = ref('')
  const inputValue = ref('')
  const activeSuggestIndex = ref(0)
  const ignoreBlurUntil = ref(0)
  const inputRef = ref<HTMLInputElement | null>(null)

  const isEditing = computed(() => editingIndex.value !== null)

  const labels = computed(() => ({
    wipPlaceholder: t('drilldown.filters.wipPlaceholder'),
    keyPlaceholder: t('drilldown.filters.fieldPlaceholder'),
    operatorPlaceholder: t('drilldown.filters.operatorPlaceholder'),
    valuePlaceholder: t('drilldown.filters.valuePlaceholder'),
    noSuggestions: t('drilldown.filters.noSuggestions'),
  }))

  const operatorOptions = computed<SuggestOption[]>(() =>
    DRILLDOWN_FILTER_OP_OPTIONS.map((option) => ({
      label: option.label,
      value: option.value,
    }))
  )

  const activeFieldKey = computed(() => {
    if (isEditing.value && editingIndex.value !== null) {
      return filters.value[editingIndex.value]?.key ?? ''
    }
    return draftKey.value
  })

  const sqlField = computed(() => isSqlFieldKey(activeFieldKey.value))

  const showKeyPrefix = computed(() => {
    if (isEditing.value && stage.value === 'key') {
      return false
    }
    if (isEditing.value) {
      return true
    }
    return stage.value === 'operator' || stage.value === 'value'
  })

  const showOpPrefix = computed(() => stage.value === 'value')

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
    filters.value.map((filter, index) => ({ filter, index })).filter((item) => editingIndex.value !== item.index)
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
    const filter: DrilldownFilter = { key, op: draftOp.value, value }
    if (isEditing.value && editingIndex.value !== null) {
      const updated = filters.value.map((item, itemIndex) => (itemIndex === editingIndex.value ? filter : item))
      setFilters(normalizeCommittedFilters(updated))
    } else {
      appendFilter(filter)
    }
    await prepareWipForNextFilter()
  }

  const advanceToOperator = () => {
    stage.value = 'operator'
    syncInputForStage()
    deferIgnoreBlur()
    focusInput()
    openSuggest()
  }

  const advanceToValue = () => {
    stage.value = 'value'
    syncInputForStage()
    if (sqlField.value) {
      loadValues(draftKey.value)
    }
    deferIgnoreBlur()
    focusInput()
    openSuggest()
  }

  const selectSuggestOption = (option: SuggestOption) => {
    if (stage.value === 'key') {
      draftKey.value = option.value
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
    if (isEditing.value) {
      return
    }
    stage.value = 'key'
    inputValue.value = draftKey.value
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

  const retreatToOperator = () => {
    draftValue.value = ''
    stage.value = 'operator'
    syncInputForStage()
    deferIgnoreBlur()
    focusInput()
    openSuggest()
  }

  const retreatToKey = () => {
    stage.value = 'key'
    inputValue.value = draftKey.value
    draftKey.value = ''
    draftOp.value = '='
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
      retreatToOperator()
      return
    }

    if (stage.value === 'operator') {
      retreatToKey()
      return
    }

    if (isEditing.value && editingIndex.value !== null) {
      removeFilterAt(editingIndex.value)
      prepareWipForNextFilter()
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
    () => [metric.value, logsTable.value, time.value, rangeTime.value[0], rangeTime.value[1], refreshKey.value],
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
    width: max-content;
    max-width: 100%;
    min-width: 120px;
    min-height: 32px;
    padding: 2px 8px;
    border: 1px solid var(--border-color);
    border-radius: var(--gpt-radius-sm);
    background: var(--color-bg-2);
    cursor: text;
    vertical-align: middle;
    transition: border-color 0.15s;

    &:hover {
      border-color: var(--color-border-3);
    }

    &.is-focused {
      border-color: rgb(var(--primary-6));
    }
  }

  .filter-combobox__row {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    width: max-content;
    max-width: 100%;
    min-height: 28px;
  }

  .filter-combobox__editor-wrap {
    flex: 0 1 auto;
    min-width: 0;
    width: auto;
  }

  .filter-combobox__editor {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    min-width: 0;
    gap: 2px;
  }

  .filter-combobox__segment {
    padding: 0 2px;
    font-size: 12px;
    line-height: 28px;
    white-space: nowrap;
    cursor: pointer;
    color: var(--color-text-2);

    &:hover {
      color: rgb(var(--primary-6));
    }
  }

  .filter-combobox__key {
    color: var(--color-text-1);
    font-weight: 600;

    &.is-readonly {
      cursor: default;

      &:hover {
        color: var(--color-text-1);
      }
    }
  }

  .filter-combobox__input {
    flex: 0 1 auto;
    width: 90px;
    min-width: 90px;
    height: 28px;
    margin: 0;
    padding: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 12px;
    line-height: 28px;
    color: var(--color-text-1);

    @supports (field-sizing: content) {
      width: auto;
      min-width: 90px;
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
    min-width: 160px;
    max-width: 320px;
    max-height: 240px;
    overflow-y: auto;
    padding: 4px;
    border: 1px solid var(--color-border-2);
    border-radius: var(--gpt-radius-sm);
    background: var(--color-bg-popup);
    box-shadow: 0 4px 10px rgb(0 0 0 / 10%);
  }

  .filter-suggest-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
  }

  .filter-suggest-empty {
    padding: 6px 8px;
    font-size: 12px;
    color: var(--color-text-3);
  }

  .filter-suggest-option {
    display: block;
    width: 100%;
    padding: 6px 8px;
    border: none;
    border-radius: var(--gpt-radius-sm);
    background: transparent;
    color: var(--color-text-1);
    font-size: 12px;
    line-height: 1.4;
    text-align: left;
    cursor: pointer;

    &:hover,
    &.is-active {
      background: var(--color-fill-2);
      color: rgb(var(--primary-6));
    }
  }
</style>
