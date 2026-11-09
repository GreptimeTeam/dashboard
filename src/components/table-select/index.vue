<template lang="pug">
a-select.table-select(
  :model-value="modelValue"
  :options="tableOptions"
  :loading="loading || searching"
  :allow-search="true"
  :allow-create="allowCreate"
  :filter-option="false"
  :virtual-list-props="virtualListProps"
  :placeholder="placeholder"
  :size="size"
  :disabled="disabled"
  :trigger-props="{ autoFitPopupMinWidth: true }"
  @search="search"
  @change="onChange"
  @update:model-value="onUpdate"
)
</template>

<script lang="ts" setup name="TableSelect">
  import useTableOptions, { type TableSignal } from '@/hooks/use-table-options'

  const props = withDefaults(
    defineProps<{
      modelValue?: string
      database?: string
      signal?: TableSignal
      limit?: number
      size?: 'mini' | 'small' | 'medium' | 'large'
      placeholder?: string
      allowCreate?: boolean
      disabled?: boolean
    }>(),
    {
      modelValue: '',
      database: '',
      signal: undefined,
      limit: 500,
      size: 'medium',
      placeholder: undefined,
      allowCreate: false,
      disabled: false,
    }
  )

  const emit = defineEmits<{
    (event: 'update:modelValue', value: string): void
    (event: 'change', value: string): void
    (event: 'loaded', names: string[]): void
  }>()

  const virtualListProps = { height: 260, fixedSize: true, estimatedSize: 36 }

  const { tableOptions, loading, searching, loadInitial, search, ensureTable, rememberRecent } = useTableOptions({
    database: () => props.database,
    signal: () => props.signal,
    limit: props.limit,
  })

  watch(
    () => props.modelValue,
    (value) => ensureTable(value),
    { immediate: true }
  )

  watch(tableOptions, () => {
    ensureTable(props.modelValue)
    emit('loaded', tableOptions.value)
  })

  const onUpdate = (value: string) => {
    emit('update:modelValue', value)
  }

  const onChange = (value: string) => {
    rememberRecent(value)
    emit('update:modelValue', value)
    emit('change', value)
  }

  defineExpose({ reload: loadInitial, options: tableOptions })
</script>
