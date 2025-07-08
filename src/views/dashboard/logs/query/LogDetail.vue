<template lang="pug">
a-drawer(
  v-if="record"
  popup-container="#log-table-container"
  ok-text="Close"
  :width="800"
  :visible="props.visible"
  :mask="false"
  :hide-cancel="true"
  @ok="handleOk"
  @cancel="handleCancel"
)
  template(#title)
    a-space
      | Log Detail
  a-tabs
    a-tab-pane(title="Fields" key="1")
      FormView(:data="viewRow" :columns="props.columns")
    a-tab-pane(title="JSON" key="2")
      JSONView(:jsonStr="JSON.stringify(viewRow, null, 2)")
</template>

<script setup lang="ts" name="LogDetail">
  import JSONView from './JSONView.vue'
  import FormView from './FormView.vue'

  const props = defineProps({
    visible: Boolean,
    record: Object,
    columns: Array,
  })

  const emit = defineEmits(['update:visible'])

  const handleOk = () => {
    emit('update:visible', false)
  }

  const handleCancel = () => {
    emit('update:visible', false)
  }

  const viewRow = computed(() => {
    if (!props.record) return {}
    const obj = { ...props.record }
    delete obj.index
    return obj
  })
</script>
