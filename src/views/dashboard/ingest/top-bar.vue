<template lang="pug">
a-space.top-bar
  a-button(
    type="primary"
    size="small"
    :loading="loading"
    :disabled="disabled"
    @click="clickSubmit"
  ) Write
  a-select(
    v-model="precision"
    style="width: 140px"
    size="small"
    :options="precisionOptions"
  )
</template>

<script lang="ts" setup name="TopBar">
  const props = defineProps<{
    disabled: boolean
    loading: boolean
  }>()
  const emits = defineEmits(['submit'])
  const precision = ref('ms')

  const clickSubmit = () => {
    emits('submit', precision.value)
  }

  const precisionOptions = [
    {
      value: 'ns',
      label: 'Nanoseconds',
    },
    {
      value: 'us',
      label: 'Microseconds',
    },
    {
      value: 'ms',
      label: 'Milliseconds',
    },
    {
      value: 's',
      label: 'Seconds',
    },
  ]
</script>

<style lang="less" scoped>
  .top-bar {
    display: flex;
    justify-content: space-between;
    padding-bottom: 20px;
    background: var(--card-bg-color);
    :deep(.arco-select-view-value) {
      font-size: 13px;
      color: var(--main-font-color);
    }
    :deep(.arco-select-view-single) {
      background: transparent;
      border-color: var(--border-color);
    }
  }
</style>
