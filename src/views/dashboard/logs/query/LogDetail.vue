<template lang="pug">
a-drawer(
  v-if="currRow"
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
      a-button(type="text" :disabled="selectedRowKey === 0" @click="handlePre")
        icon-arrow-up
      a-button(type="text" :disabled="selectedRowKey === rows.length - 1" @click="handleNext")
        icon-arrow-down
  a-tabs
    a-tab-pane(title="Fields" key="1")
      FormView(:data="viewRow")
    a-tab-pane(title="JSON" key="2")
      JSONView(:jsonStr="JSON.stringify(viewRow, null, 2)")
</template>

<script setup lang="ts" name="LogDetail">
  import useLogQueryStore from '@/store/modules/logquery'
  import JSONView from './JSONView.vue'
  import FormView from './FormView.vue'

  const props = defineProps<{ visible: boolean }>()
  const emit = defineEmits(['update:visible'])
  const handleOk = () => {
    emit('update:visible', false)
  }
  const handleCancel = () => {
    emit('update:visible', false)
  }
  const { selectedRowKey, currRow, rows } = storeToRefs(useLogQueryStore())
  const viewRow = computed(() => {
    const obj = { ...currRow.value }
    return obj
  })

  const handlePre = () => {
    selectedRowKey.value -= 1
  }

  const handleNext = () => {
    selectedRowKey.value += 1
  }
</script>
