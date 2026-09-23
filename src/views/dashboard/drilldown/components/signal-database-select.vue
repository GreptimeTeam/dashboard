<template lang="pug">
a-select.signal-database-select(
  allow-search
  :class="{ 'signal-database-select--block': block }"
  :size="size"
  :model-value="modelValue"
  :options="databaseOptions"
  :placeholder="t('dashboard.database')"
  :aria-label="t('dashboard.database')"
  @change="onChange"
  @popup-visible-change="onPopupVisibleChange"
)
</template>

<script setup lang="ts">
  import { computed, onMounted } from 'vue'
  import { storeToRefs } from 'pinia'
  import { useI18n } from 'vue-i18n'
  import { useAppStore } from '@/store'

  const props = withDefaults(
    defineProps<{
      modelValue: string
      size?: 'mini' | 'small' | 'medium' | 'large'
      /** Stretch to parent width (Metrics catalog sidebar). */
      block?: boolean
    }>(),
    {
      size: 'medium',
      block: false,
    }
  )

  const emit = defineEmits<{
    'update:modelValue': [value: string]
  }>()

  const { t } = useI18n()
  const appStore = useAppStore()
  const { databaseList } = storeToRefs(appStore)

  const databaseOptions = computed(() => {
    const current = props.modelValue
    const names = databaseList.value.length ? [...databaseList.value] : []
    if (current && !names.includes(current)) {
      names.unshift(current)
    }
    return names.map((name) => ({ label: name, value: name }))
  })

  const onChange = (value: string) => {
    if (!value || value === props.modelValue) {
      return
    }
    emit('update:modelValue', value)
  }

  const onPopupVisibleChange = (visible: boolean) => {
    if (visible && databaseList.value.length === 0) {
      appStore.refreshDatabaseList()
    }
  }

  onMounted(() => {
    if (databaseList.value.length === 0) {
      appStore.refreshDatabaseList()
    }
  })
</script>

<style scoped lang="less">
  .signal-database-select {
    flex-shrink: 0;
    min-width: 120px;
    width: 150px;
    max-width: 100%;
  }

  .signal-database-select--block {
    width: 100%;
  }
</style>
