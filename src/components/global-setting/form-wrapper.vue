<template>
  <a-input-number
    v-if="type === 'number'"
    :style="{ width: '80px' }"
    size="small"
    :default-value="(defaultValue as number)"
    @change="handleChange"
  />
  <a-input v-else-if="type === 'input'" size="small" :default-value="(defaultValue as string)" @change="handleChange" />
  <a-input-password
    v-else-if="type === 'password'"
    size="small"
    :default-value="(defaultValue as string)"
    @change="handleChange"
  />
  <a-select
    v-else-if="type === 'select'"
    :select-ops="selectOps"
    :default-value="(defaultValue as string)"
    :disabled="disabled"
    @change="handleChange"
  >
    <a-option v-for="item of selectOps" :key="item" :value="item" :label="item"></a-option>
  </a-select>
  <a-switch v-else :default-checked="(defaultValue as boolean)" size="small" @change="handleChange" />
</template>

<script lang="ts" setup>
  const props = defineProps({
    type: {
      type: String,
      default: '',
    },
    name: {
      type: String,
      default: '',
    },
    defaultValue: {
      type: [String, Boolean, Number],
      default: '',
    },
    selectOps: {
      type: Array<any>,
      default: [],
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  })
  const emit = defineEmits(['inputChange'])
  const handleChange = (value: unknown) => {
    emit('inputChange', {
      value,
      key: props.name,
    })
  }
</script>
