<template lang="pug">
.step-selector
  a-select(
    v-model:model-value="selectedOption"
    size="small"
    style="width: 120px"
    placeholder="Step"
    title="Select step resolution or enter custom value"
  )
    a-option(
      v-for="option in stepOptions"
      :key="option.value"
      :value="option.value"
      :label="option.label"
    )
      | {{ option.label }}

  a-input(
    v-if="selectedOption === 'custom'"
    v-model="customStepInput"
    size="small"
    placeholder="e.g., 30s, 2m, 1h"
    style="width: 120px; margin-left: 8px"
    title="Enter custom step with time units (s, m, h) or just seconds"
    :status="isCustomStepValid ? 'normal' : 'error'"
  )
</template>

<script setup lang="ts">
  import { ref, computed, watch, onMounted } from 'vue'

  // Props
  const props = defineProps<{
    modelValue: string // User selection (e.g., "low", "30s", "2m", "1h")
    unixTimeRange: () => number[] // Function to get unix time range for resolution calculation
  }>()

  // Step resolution options (similar to Prometheus UI)
  const stepOptions = [
    { label: 'Low res.', value: 'low', seconds: null },
    { label: 'Medium res.', value: 'medium', seconds: null },
    { label: 'High res.', value: 'high', seconds: null },
    { label: '10s', value: '10s', seconds: 10 },
    { label: '30s', value: '30s', seconds: 30 },
    { label: '1m', value: '1m', seconds: 60 },
    { label: '5m', value: '5m', seconds: 300 },
    { label: '15m', value: '15m', seconds: 900 },
    { label: '1h', value: '1h', seconds: 3600 },
    { label: 'Custom', value: 'custom', seconds: null },
  ]

  // Emits
  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void // User selection model
    (e: 'stepChange', step: number): void // Real step value in seconds
  }>()

  const selectedOption = ref<string>(props.modelValue)
  // Local state
  const customStepInput = ref('')

  // Helper function to parse step input with time units
  const parseStepInput = (input: string): number | null => {
    if (!input.trim()) return null

    const trimmed = input.trim().toLowerCase()
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(s|m|h)?$/)

    if (!match) return null

    const value = parseFloat(match[1])
    const unit = match[2] || 's'

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

  // Helper function to calculate real step value from user selection
  const calculateRealStepValue = (userSelection: string): number => {
    // Check if it's a resolution option
    if (userSelection === 'low' || userSelection === 'medium' || userSelection === 'high') {
      return calculateStepFromResolution(userSelection)
    }

    // Check if it's a predefined time step
    const predefinedOption = stepOptions.find((opt) => opt.value === userSelection && opt.seconds)
    if (predefinedOption && predefinedOption.seconds) {
      return predefinedOption.seconds
    }

    // Try to parse as time unit (for custom input)
    const parsed = parseStepInput(userSelection)
    if (parsed !== null) {
      return parsed
    }

    // Fallback to medium resolution
    return calculateStepFromResolution('medium')
  }

  // Function to convert user input to proper format
  const convertUserInputToSelection = (input: string): string => {
    // Check if it's already a valid option
    const validOption = stepOptions.find((opt) => opt.value === input)
    if (validOption) {
      return input
    }

    // Only try to match predefined options if input contains time units (s, m, h)
    const hasTimeUnit = /\d+\s*(s|m|h)$/i.test(input.trim())
    if (hasTimeUnit) {
      const parsed = parseStepInput(input)
      if (parsed !== null) {
        // Check if it matches any predefined option
        const matchingOption = stepOptions.find((opt) => opt.seconds === parsed)
        if (matchingOption) {
          return matchingOption.value
        }

        // Convert to formatted time string
        return formatStepDisplay(parsed)
      }
    }

    // Keep original user input if no time unit or no match found
    return input
  }

  // Computed property to check if custom input is valid
  const isCustomStepValid = computed(() => {
    if (props.modelValue !== 'custom') return true
    return parseStepInput(customStepInput.value) !== null
  })

  // Watch for custom step input changes
  watch(customStepInput, (newInput) => {
    if (selectedOption.value === 'custom' && newInput) {
      const convertedSelection = convertUserInputToSelection(newInput)
      const realStepValue = calculateRealStepValue(convertedSelection)
      emit('update:modelValue', convertedSelection)
      emit('stepChange', realStepValue)
    }
  })

  // Watch for external modelValue changes
  watch(
    () => selectedOption.value,
    (newValue, oldValue) => {
      if (newValue === 'custom') {
        if (['low', 'medium', 'high'].includes(props.modelValue)) {
          const stepSeconds = calculateStepFromResolution(props.modelValue)
          customStepInput.value = formatStepDisplay(stepSeconds)
        } else {
          customStepInput.value = oldValue
        }
      } else {
        emit('update:modelValue', newValue)
      }
    }
  )

  watch(
    () => props.modelValue,
    (newValue) => {
      const convertedSelection = convertUserInputToSelection(newValue)
      if (stepOptions.find((opt) => opt.value === convertedSelection)) {
        selectedOption.value = convertedSelection
      } else {
        selectedOption.value = 'custom'
      }
    },
    {
      immediate: true,
    }
  )

  watch(
    () => props.modelValue,
    (newValue, oldValue) => {
      if (newValue !== 'custom') {
        const realStepValue = calculateRealStepValue(newValue)
        emit('stepChange', realStepValue)
      }
    },
    {
      immediate: true,
    }
  )

  // Watch for unixTimeRange changes to recalculate resolution options
  watch(
    () => props.unixTimeRange(),
    () => {
      // Recalculate if current selection is a resolution option
      if (['low', 'medium', 'high'].includes(props.modelValue)) {
        const realStepValue = calculateRealStepValue(props.modelValue)
        emit('stepChange', realStepValue)
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
