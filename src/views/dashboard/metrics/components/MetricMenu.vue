<template lang="pug">
a-dropdown.metric-menu(
  trigger="click"
  position="bl"
  :popup-container="'body'"
  :popup-visible="popupVisible"
  @popup-visible-change="handleMenuDropdownVisibleChange"
)
  template(#content)
    .form
      .close-button(@click="handleClose")
        icon-close (size="24")

      .expression-row
        .control-label {{ nodeData.labelName }}

        a-select.operator-select(v-model="selectedOperator" size="small" style="width: auto")
          a-option(value="=") =
          a-option(value="!=") !=
          a-option(value="=~") =~
          a-option(value="!~") !~
        a-select.value-select(
          v-if="nodeData.type === 'label'"
          v-model="selectedValue"
          size="small"
          placeholder="Select value"
          allow-search
          :style="{ width: '120px' }"
          :allow-clear="true"
        )
          a-option(v-for="child in nodeData.children || []" :key="child.value" :value="child.value") {{ child.value }}
        span.value-select-placeholder(v-else) {{ nodeData.value }}

      a-divider

      a-space.action-row
        a-button.insert-button(size="small" @click="handleInsertLabelWithValue")
          | Insert
        a-button.copy-button(size="small" @click="handleCopyLabelWithValue")
          | Copy
</template>

<script setup lang="ts">
  import { ref, watch, onMounted } from 'vue'

  const props = defineProps<{
    nodeData: {
      type: 'label' | 'value'
      title: string
      labelName?: string
      value?: string
      metricName?: string
      children?: { metricName: string; labelName: string; value: string; type: 'value' }[]
    }
    popupVisible?: boolean
  }>()

  // Reactive state for label controls
  const selectedOperator = ref<string>('=')
  const selectedValue = ref<string>('')

  // Reset values when nodeData changes
  watch(
    () => props.nodeData,
    (newNodeData) => {
      console.log('nodeData changed:', newNodeData)
      selectedOperator.value = '='
      if (newNodeData.type === 'label') {
        selectedValue.value = ''
      } else {
        selectedValue.value = newNodeData.value
      }
    },
    { immediate: true }
  )

  const emits = defineEmits<{
    (e: 'copyText', text: string): void
    (e: 'insertText', text: string): void
    (e: 'loadValues', data: any): void
    (e: 'update:popupVisible', visible: boolean): void
  }>()

  // Load values when component mounts for label nodes
  onMounted(() => {
    if (props.nodeData.type === 'label' && props.nodeData.metricName) {
      emits('loadValues', props.nodeData)
    }
  })

  // Handle dropdown visibility change
  const handleMenuDropdownVisibleChange = (visible: boolean) => {
    // Emit visibility update for v-model binding
    emits('update:popupVisible', visible)

    if (visible && props.nodeData.type === 'label' && props.nodeData.metricName) {
      // Load values when the dropdown opens
      emits('loadValues', props.nodeData)
    }
  }

  // Handle close button click
  const handleClose = () => {
    emits('update:popupVisible', false)
  }

  // Insert label with selected operator and value
  const handleInsertLabelWithValue = () => {
    const text = `${props.nodeData.labelName}${selectedOperator.value}"${selectedValue.value}"`
    emits('insertText', text)
    emits('update:popupVisible', false)
  }

  const handleCopyLabelWithValue = () => {
    const text = `${props.nodeData.labelName}${selectedOperator.value}"${selectedValue.value}"`
    emits('copyText', text)
    emits('update:popupVisible', false)
  }
</script>

<style scoped lang="less">
  .form {
    padding: 20px;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .close-button {
    position: absolute;
    top: -2px;
    right: 2px;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: var(--color-text-3);
    transition: all 0.2s ease;
    display: flex;

    &:hover {
      background-color: var(--color-fill-3);
      color: var(--color-text-1);
    }
  }

  .expression-row {
    background-color: var(--color-fill-2);
    padding: 10px;
    border-radius: 4px;
    border: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: 10px;
  }
</style>
