<template lang="pug">
a-space.toolbar
  a-checkbox(v-model="localWrapLines" size="small" @change="emitWrapLineChange")
    | {{ $t('dashboard.wrapLines') }}
</template>

<script lang="ts" setup>
  const props = withDefaults(
    defineProps<{
      wrapLines?: boolean
    }>(),
    {
      wrapLines: false,
    }
  )

  const emit = defineEmits<{
    (e: 'change', value: boolean): void
  }>()

  const localWrapLines = ref(props.wrapLines)

  watch(
    () => props.wrapLines,
    (value) => {
      localWrapLines.value = value
    }
  )

  const emitWrapLineChange = (value: boolean | (string | number | boolean)[]) => {
    emit('change', Boolean(value))
  }
</script>

<style lang="less" scoped>
  .toolbar {
    padding: 4px 8px;
    height: 26px;
    width: 100%;
    justify-content: flex-end;

    .arco-checkbox {
      font-size: 11px;
    }
  }
</style>
