<template lang="pug">
.quick-fields-section
  | {{ t('quickFilters.title') }}
  div(style="display: flex; flex-wrap: wrap; gap: 8px")
    a-tag(
      v-for="quickFilter in savedQuickFilters"
      :key="quickFilter.name"
      style="cursor: pointer"
      :closable="true"
      @click="onApplyQuickFilter(quickFilter)"
      @close="removeQuickFilter(quickFilter.name)"
    )
      span(:title="t('quickFilters.clickToApplyTitle')") {{ quickFilter.name }}
    a-tag.quick-fields-save(type="text" style="cursor: pointer" @click="showSaveQuickFilter = true")
      template(#icon)
        icon-plus
      | {{ t('quickFilters.saveCurrentSearch') }}
  a-modal(
    v-model:visible="showSaveQuickFilter"
    :title="t('quickFilters.saveModalTitle')"
    :width="500"
    :on-before-ok="saveCurrentAsQuickFilter"
    @cancel="showSaveQuickFilter = false"
  )
    a-form(
      ref="formRef"
      layout="vertical"
      :model="saveQuickFilterForm"
      :rules="saveQuickFilterRules"
    )
      a-form-item(field="name" :label="t('quickFilters.name')")
        a-input(v-model="saveQuickFilterForm.name" maxlength="50" :placeholder="t('quickFilters.namePlaceholder')")
      a-form-item(field="description" :label="t('quickFilters.description')")
        a-descriptions(
          size="small"
          bordered
          layout="vertical"
          style="width: 100%"
          :column="1"
        )
          a-descriptions-item(:label="t('quickFilters.table')")
            a-tag(color="blue") {{ props.form.table }}
          a-descriptions-item(v-if="props.form.conditions.length > 0" :label="t('quickFilters.conditions')")
            .conditions-list
              a-tag(
                v-for="(condition, index) in props.form.conditions"
                :key="index"
                color="green"
                style="margin-bottom: 4px; margin-right: 4px"
              )
                | {{ condition.field }} {{ condition.operator }} {{ condition.value }}
          a-descriptions-item(v-else :label="t('quickFilters.conditions')")
            a-tag(color="gray") {{ t('quickFilters.noConditions') }}
</template>

<script setup lang="ts" name="QuickFilters">
  import { ref, computed, watch, reactive, nextTick } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { useLocalStorage } from '@vueuse/core'
  import type { BuilderFormState, Condition } from '@/types/query'

  interface TableField {
    name: string
    data_type: string
    semantic_type: string
  }

  interface QuickFilter extends BuilderFormState {
    name: string
    createdAt: number
  }

  const emit = defineEmits(['apply'])
  const { t } = useI18n()

  const props = defineProps<{
    fields: TableField[]
    form: BuilderFormState
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
      { required: true, message: t('quickFilters.nameRequired') },
      { minLength: 2, message: t('quickFilters.nameMin') },
      { maxLength: 50, message: t('quickFilters.nameMax') },
      {
        validator: (value: string, cb: (msg?: string) => void) => {
          const trimmedName = value.trim().toLowerCase()
          const existingFilter = savedQuickFilters.value.find((filter) => filter.name.toLowerCase() === trimmedName)
          if (existingFilter) {
            cb(t('quickFilters.nameExists'))
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
          tsColumn: null,
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
        tsColumn: null,
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
