<template lang="pug">
.step-selector
  a-dropdown(:popup-max-height="false" @select="handleDropdownSelect")
    a-button(
      size="small"
      style="display: flex; justify-content: space-between; width: 130px"
      :title="'Select step resolution or enter custom value'"
    )
      | {{ getCurrentSelectionLabel() }}
      icon-down
    template(#content)
      a-doption(
        v-for="option in stepOptions"
        :key="option.value"
        style="width: 130px"
        :value="option.value"
      )
        | {{ option.label }}

  a-input(
    v-if="currentSelection === 'custom'"
    v-model="customStepInput"
    size="small"
    placeholder="e.g., 30s, 2m, 1h"
    style="width: 80px; margin-left: 8px"
    title="Enter custom step with time units (s, m, h) or just seconds"
    :status="isCustomStepValid ? 'normal' : 'error'"
  )
</template>

<script setup lang="ts">
  import { ref, computed, watch, onMounted } from 'vue'
  import { IconDown } from '@arco-design/web-vue/es/icon'

  // Props
  const props = defineProps<{
    selectionType: string // Selection type: 'low', 'medium', 'high', 'fixed', 'custom'
    stepValue: number // Step value in seconds
    unixTimeRange: () => number[] // Function to get unix time range for resolution calculation
  }>()

  // Step resolution options (similar to Prometheus UI)
  const stepOptions = [
    { label: 'Low res.', value: 'low', type: 'resolution' },
    { label: 'Medium res.', value: 'medium', type: 'resolution' },
    { label: 'High res.', value: 'high', type: 'resolution' },
    { label: '10s', value: '10s', seconds: 10, type: 'fixed' },
    { label: '30s', value: '30s', seconds: 30, type: 'fixed' },
    { label: '1m', value: '1m', seconds: 60, type: 'fixed' },
    { label: '5m', value: '5m', seconds: 300, type: 'fixed' },
    { label: '15m', value: '15m', seconds: 900, type: 'fixed' },
    { label: '1h', value: '1h', seconds: 3600, type: 'fixed' },
    { label: 'Custom', value: 'custom', type: 'custom' },
  ]

  // Emits
  const emit = defineEmits<{
    (e: 'update:selectionType', value: string): void // Selection type model
    (e: 'update:stepValue', value: number): void // Step value model in seconds
  }>()

  // Local state for current selection and custom input
  const currentSelection = ref<string>('')
  const customStepInput = ref('')

  // Helper function to parse step input (supports h, m, s units)
  const parseStepInput = (input: string): number | null => {
    if (!input.trim()) return null

    const trimmed = input.trim().toLowerCase()
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(s|m|h)?$/)

    if (!match) return null

    const value = parseFloat(match[1])
    if (Number.isNaN(value) || value <= 0) return null

    const unit = match[2]

    // If no unit specified, return the value as-is
    if (!unit) {
      return null
    }

    switch (unit) {
      case 's':
        return value
      case 'm':
        return value * 60
      case 'h':
        return value * 3600
      default:
        return value
    }
  }

  // Helper function to calculate step from resolution option
  const calculateStepFromResolution = (resolution: string): number => {
    const timeRange = props.unixTimeRange()
    if (!timeRange || timeRange.length !== 2) {
      return 30 // Default fallback
    }

    const [start, end] = timeRange
    const diffSeconds = end - start

    if (resolution === 'low') {
      return Math.max(Math.floor(diffSeconds / 100), 1) // ~100 data points
    }
    if (resolution === 'high') {
      return Math.max(Math.floor(diffSeconds / 500), 1) // ~500 data points
    }
    return Math.max(Math.floor(diffSeconds / 250), 1) // ~250 data points (medium)
  }

  // Computed property to check if custom input is valid
  const isCustomStepValid = computed(() => {
    if (currentSelection.value !== 'custom') return true
    return parseStepInput(customStepInput.value) !== null
  })

  // Helper function to get current selection label
  const getCurrentSelectionLabel = () => {
    const option = stepOptions.find((opt) => opt.value === currentSelection.value)
    return option ? option.label : 'Step'
  }

  // Handle dropdown selection
  const handleDropdownSelect = (value: string) => {
    currentSelection.value = value
  }

  // Watch for selection changes
  watch(currentSelection, (newSelection) => {
    const selectedOption = stepOptions.find((opt) => opt.value === newSelection)
    let stepValue = selectedOption?.seconds
    if (selectedOption.type === 'resolution') {
      stepValue = calculateStepFromResolution(selectedOption.value)
    }
    if (selectedOption.type !== 'custom') {
      emit('update:stepValue', stepValue)
    }
    emit('update:selectionType', selectedOption.value)
  })

  // Watch for custom step input changes
  watch(customStepInput, (newInput) => {
    if (currentSelection.value === 'custom' && newInput) {
      const parsedValue = parseStepInput(newInput)
      if (parsedValue !== null) {
        emit('update:stepValue', parsedValue)
      }
    }
  })

  // Helper function to format step for display
  const formatStepDisplay = (step: number): string => {
    if (step >= 3600 && step % 3600 === 0) {
      return `${step / 3600}h`
    }
    if (step >= 60 && step % 60 === 0) {
      return `${step / 60}m`
    }
    return `${step}s`
  }

  // Watch for external prop changes
  watch(
    [() => props.selectionType, () => props.stepValue],
    () => {
      currentSelection.value = props.selectionType
      if (props.selectionType === 'custom') {
        customStepInput.value = formatStepDisplay(props.stepValue)
      }
    },
    { immediate: true }
  )

  // Watch for unixTimeRange changes to recalculate resolution options
  watch(
    () => props.unixTimeRange(),
    () => {
      // Recalculate if current selection is a resolution option
      if (['low', 'medium', 'high'].includes(props.selectionType)) {
        const stepValue = calculateStepFromResolution(props.selectionType)
        emit('update:stepValue', stepValue)
      }
    },
    { deep: true }
  )
</script>

<style scoped lang="less">
  .step-selector {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
