<template lang="pug">
a-descriptions(layout="vertical" bordered :column="1")
  a-descriptions-item(v-for="item of formData")
    template(#label)
      a-typography-text(copyable type="secondary" :copy-text="String(item.value)")
        | {{ item.label }} : {{ item.type }}
    | {{ item.value }}
</template>

<script setup name="FormView" type="ts">
  import useLogsQueryStore from '@/store/modules/logs-query'

  const displayValue = (val, type) => {
    switch (type) {
      case 'json':
        return JSON.stringify(val, null, 2)
      default:
        return val
    }
  }

  const props = defineProps(['data'])
  const { columns } = storeToRefs(useLogsQueryStore())
  const formData = computed(() => {
    return Object.keys(props.data)
      .filter((v) => v !== 'key')
      .map((v) => {
        const columnType = columns.value.filter((c) => c.name === v)[0]?.data_type
        return {
          label: v,
          type: columnType,
          value: displayValue(props.data[v], columnType),
        }
      })
  })
</script>

<style scoped lang="less">
  :deep(.arco-descriptions-item-value) {
    font-family: 'Roboto Mono', monospace;
  }
</style>
