<template lang="pug">
a-descriptions(layout="vertical" bordered :column="1")
  a-descriptions-item(v-for="item of formData")
    template(#label)
      a-typography-text(copyable type="secondary" :copy-text="String(item.value)")
        | {{ item.label }} : {{ item.type }}
    | {{ item.value }}
</template>

<script setup name="FormView" type="ts">
  import useLogQueryStore from '@/store/modules/logquery';

  const props = defineProps(['data'])
  const { columns } = storeToRefs(useLogQueryStore())
  const formData = computed(() => {
    return Object.keys(props.data).filter((v) => v !== 'key').map((v) => {
      return {
        label: v,
        type: columns.value.filter(c => c.name === v)[0]?.data_type,
        value: props.data[v]
      }
    })
  })
</script>

<style scoped lang="less">
  :deep(.arco-descriptions-item-value) {
    font-family: 'Roboto Mono', monospace;
  }
</style>
