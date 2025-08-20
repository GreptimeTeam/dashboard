<template lang="pug">
a-dropdown.metric-menu(
  trigger="click"
  position="bl"
  :popup-container="'body'"
  :popup-visible="popupVisible"
  @popup-visible-change="handleMenuDropdownVisibleChange"
)
  template(#content)
    // For label nodes - show operator and value selects
    template(v-if="nodeData.type === 'label'")
      .label-controls
        a-select.operator-select(
          v-model="selectedOperator"
          size="small"
          placeholder="Operator"
          style="width: 80px; margin-bottom: 8px"
        )
          a-option(value="=") =
          a-option(value="!=") !=
          a-option(value="=~") =~
          a-option(value="!~") !~

        a-select.value-select(
          v-model="selectedValue"
          size="small"
          placeholder="Select value"
          style="width: 120px; margin-bottom: 8px"
          :allow-clear="true"
        )
          a-option(v-for="child in nodeData.children || []" :key="child.value" :value="child.value") {{ child.value }}

        pre {{ nodeData.title }}{{ selectedOperator }}"{{ selectedValue }}"
        a-space
          a-button.insert-button(size="small" @click="handleInsertLabelWithValue")
            | Insert
          a-button.copy-button(size="small" @click="handleCopyLabelWithValue")
            | Copy

    // For value nodes - show operator select only, value is the node itself
    template(v-else-if="nodeData.type === 'value'")
      .value-controls
        a-select.operator-select(
          v-model="selectedOperator"
          size="small"
          placeholder="Operator"
          style="width: 80px; margin-bottom: 8px"
        )
          a-option(value="=") =
          a-option(value="!=") !=
          a-option(value="=~") =~
          a-option(value="!~") !~

        pre {{ nodeData.labelName }}{{ selectedOperator }}"{{ nodeData.value }}"
        a-space
          a-button.insert-button(type="primary" size="small" @click="handleInsertValueWithOperator")
            | Insert
          a-button.copy-button(type="primary" size="small" @click="handleCopyValueWithOperator")
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

  console.log('MetricMenu props:', props.nodeData)

  // Reactive state for label controls
  const selectedOperator = ref<string>('=')
  const selectedValue = ref<string>('')

  // Reset values when nodeData changes
  watch(
    () => props.nodeData,
    (newNodeData) => {
      console.log('nodeData changed:', newNodeData)
      selectedOperator.value = '='
      selectedValue.value = ''
      console.log('Reset values - operator:', selectedOperator.value, 'value:', selectedValue.value)
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
    if (props.nodeData.type === 'label' && props.nodeData.metricName && props.nodeData.title) {
      emits('loadValues', props.nodeData)
    }
  })

  // Handle menu button click
  const handleMenuClick = (event: Event) => {
    event.stopPropagation()
  }

  // Handle dropdown visibility change
  const handleMenuDropdownVisibleChange = (visible: boolean) => {
    // Emit visibility update for v-model binding
    emits('update:popupVisible', visible)

    if (visible && props.nodeData.type === 'label' && props.nodeData.metricName && props.nodeData.title) {
      // Load values when the dropdown opens
      emits('loadValues', props.nodeData)
    }
  }

  // Insert label with selected operator and value
  const handleInsertLabelWithValue = () => {
    console.log('handleInsertLabelWithValue called')
    console.log('selectedOperator:', selectedOperator.value)
    console.log('selectedValue:', selectedValue.value)
    if (selectedOperator.value && selectedValue.value) {
      const text = `${props.nodeData.title}${selectedOperator.value}"${selectedValue.value}"`
      console.log('Inserting text:', text)
      emits('insertText', text)
    } else {
      console.log('Values not ready for insert')
    }
  }

  const handleCopyLabelWithValue = () => {
    const text = `${props.nodeData.title}${selectedOperator.value}"${selectedValue.value}"`
    emits('copyText', text)
  }

  // Handler for value nodes - insert with selected operator
  const handleInsertValueWithOperator = () => {
    const text = `${props.nodeData.labelName}${selectedOperator.value}"${props.nodeData.value}"`
    emits('insertText', text)
  }

  // Handler for value nodes - copy with selected operator
  const handleCopyValueWithOperator = () => {
    const text = `${props.nodeData.labelName}${selectedOperator.value}"${props.nodeData.value}"`
    emits('copyText', text)
  }

  // Handler for label nodes - insert just the label name
  const handleInsertLabel = () => {
    const text = `${props.nodeData.title}`
    emits('insertText', text)
  }

  // Handlers for value nodes with different operators
  const handleInsertEquals = () => {
    const text = `${props.nodeData.labelName}="${props.nodeData.value}"`
    emits('insertText', text)
  }

  const handleInsertNotEquals = () => {
    const text = `${props.nodeData.labelName}!="${props.nodeData.value}"`
    emits('insertText', text)
  }

  const handleInsertRegexMatch = () => {
    const text = `${props.nodeData.labelName}=~"${props.nodeData.value}"`
    emits('insertText', text)
  }

  const handleInsertRegexNotMatch = () => {
    const text = `${props.nodeData.labelName}!~"${props.nodeData.value}"`
    emits('insertText', text)
  }
</script>

<style scoped lang="less">
  .label-controls,
  .value-controls {
    padding: 8px;
    min-width: 200px;

    .operator-select,
    .value-select {
      margin-bottom: 8px;
    }

    .insert-button,
    .copy-button {
      width: 100%;
      margin-top: 8px;
    }
  }
</style>
