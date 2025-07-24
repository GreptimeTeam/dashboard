<template>
  <div class="quick-fields-section">
    Quick Filters
    <div style="display: flex; flex-wrap: wrap; gap: 8px">
      <a-tag
        v-for="quickFilter in savedQuickFilters"
        :key="quickFilter.name"
        style="cursor: pointer"
        :closable="true"
        @click="onApplyQuickFilter(quickFilter)"
        @close="removeQuickFilter(quickFilter.name)"
      >
        <span :title="'Click to apply quick filter'">{{ quickFilter.name }}</span>
      </a-tag>
      <a-tag class="quick-fields-save" type="text" style="cursor: pointer" @click="showSaveQuickFilter = true">
        <template #icon>
          <icon-plus />
        </template>
        Save Current Search
      </a-tag>
    </div>
    <a-modal
      v-model:visible="showSaveQuickFilter"
      title="Save Current Search as Quick Filter"
      :width="500"
      :on-before-ok="saveCurrentAsQuickFilter"
      @cancel="showSaveQuickFilter = false"
    >
      <a-form ref="formRef" layout="vertical" :model="saveQuickFilterForm" :rules="saveQuickFilterRules">
        <a-form-item label="Name" field="name">
          <a-input v-model="saveQuickFilterForm.name" placeholder="Enter a name for this quick filter" maxlength="50" />
        </a-form-item>
      </a-form>
      <a-descriptions size="small" title="Current Search" :column="1" bordered layout="vertical">
        <a-descriptions-item label="Table">
          <a-tag color="blue">{{ props.form.table }}</a-tag>
        </a-descriptions-item>
        <a-descriptions-item v-if="props.form.conditions.length > 0" label="Conditions">
          <div class="conditions-list">
            <a-tag
              v-for="(condition, index) in props.form.conditions"
              :key="index"
              color="green"
              style="margin-bottom: 4px; margin-right: 4px"
            >
              {{ condition.field }} {{ condition.operator }} {{ condition.value }}
            </a-tag>
          </div>
        </a-descriptions-item>
        <a-descriptions-item v-else label="Conditions">
          <a-tag color="gray">No conditions set</a-tag>
        </a-descriptions-item>
      </a-descriptions>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, watch, reactive, nextTick } from 'vue'
  import { useLocalStorage } from '@vueuse/core'

  interface Condition {
    field: string
    operator: string
    value: string
    relation?: 'AND' | 'OR'
    isTimeColumn?: boolean
  }

  interface TableField {
    name: string
    data_type: string
    semantic_type: string
  }

  interface QuickFilter {
    name: string
    table: string
    conditions: Condition[]
    orderByField: string
    orderBy: string
    limit: number
    createdAt: number
  }

  const emit = defineEmits(['apply'])

  const props = defineProps<{
    fields: TableField[]
    form: {
      table: string
      orderByField: string
      orderBy: string
      limit: number
      conditions: Condition[]
    }
    quickFieldNames?: string[]
    storageKey: string
  }>()

  const quickFiltersStorageKey = computed(() => `${props.storageKey}-quick-filters`)
  const clearedFiltersKey = computed(() => `${props.storageKey}-filters-cleared`)
  let savedQuickFilters = useLocalStorage(quickFiltersStorageKey.value, [] as QuickFilter[])
  const userClearedFilters = useLocalStorage(clearedFiltersKey.value, false)

  const showSaveQuickFilter = ref(false)
  const formRef = ref()
  const saveQuickFilterForm = reactive({ name: '' })

  const saveQuickFilterRules = {
    name: [
      { required: true, message: 'Name is required' },
      { minLength: 2, message: 'Name must be at least 2 characters' },
      { maxLength: 50, message: 'Name must be less than 50 characters' },
      {
        validator: (value: string, cb: (msg?: string) => void) => {
          const trimmedName = value.trim().toLowerCase()
          const existingFilter = savedQuickFilters.value.find((filter) => filter.name.toLowerCase() === trimmedName)
          if (existingFilter) {
            cb('A quick filter with this name already exists')
          } else {
            cb()
          }
        },
      },
    ],
  }

  function createDefaultQuickFilters(): QuickFilter[] {
    if (!props.quickFieldNames || !props.form.table || !props.fields.length) return []
    return props.quickFieldNames
      .filter((fieldName) => props.fields.some((field) => field.name === fieldName))
      .map((fieldName) => {
        const field = props.fields.find((f) => f.name === fieldName)
        const isTimeCol = field?.data_type.toLowerCase().includes('timestamp') || false
        const defaultOperator = '='
        return {
          name: fieldName,
          table: props.form.table,
          conditions: [
            {
              field: fieldName,
              operator: defaultOperator,
              value: '',
              isTimeColumn: isTimeCol,
              relation: 'AND',
            },
          ],
          orderByField: props.form.orderByField,
          orderBy: props.form.orderBy,
          limit: props.form.limit,
          createdAt: Date.now(),
        }
      })
  }

  function initializeQuickFilters() {
    // Only initialize default filters if user hasn't manually cleared them
    if (savedQuickFilters.value.length === 0 && !userClearedFilters.value && props.quickFieldNames) {
      const defaults = createDefaultQuickFilters()
      if (defaults.length > 0) {
        savedQuickFilters.value = defaults
      }
    }
  }

  watch(
    () => [props.fields, props.form.table],
    () => {
      savedQuickFilters = useLocalStorage(quickFiltersStorageKey.value, [] as QuickFilter[])
      nextTick(() => {
        initializeQuickFilters()
      })
    }
  )

  async function saveCurrentAsQuickFilter() {
    await nextTick()
    return (formRef.value as any).validate().then((errors: any) => {
      if (errors) return false
      const newQuickFilter: QuickFilter = {
        name: saveQuickFilterForm.name.trim(),
        table: props.form.table,
        conditions: [...props.form.conditions],
        orderByField: props.form.orderByField,
        orderBy: props.form.orderBy,
        limit: props.form.limit,
        createdAt: Date.now(),
      }
      savedQuickFilters.value.push(newQuickFilter)

      // Reset the cleared flag since user is actively using filters
      userClearedFilters.value = false

      saveQuickFilterForm.name = ''
      showSaveQuickFilter.value = false
      return true
    })
  }

  function onApplyQuickFilter(quickFilter: QuickFilter) {
    emit('apply', quickFilter)
  }

  function removeQuickFilter(filterId: string) {
    const idx = savedQuickFilters.value.findIndex((filter) => filter.name === filterId)
    if (idx !== -1) {
      savedQuickFilters.value.splice(idx, 1)
      // Mark that user has manually cleared filters
      if (savedQuickFilters.value.length === 0) {
        userClearedFilters.value = true
      }
    }
  }
</script>

<style scoped lang="less">
  .quick-fields-section {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
