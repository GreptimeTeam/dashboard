<template lang="pug">
a-form(
  label-align="left"
  size="small"
  auto-label-width
  :model="form"
)
  a-form-item(field="table" label="Table")
    a-select(
      v-model="inputTableName"
      style="width: auto"
      placeholder="Select Table"
      :options="tables"
      :allow-search="true"
      @change="handleTableChange"
    )
  a-form-item(label="Where" field="conditions")
    .condition-wrapper
      a-space(v-for="(condition, index) in form.conditions")
        a-input-group.input-group
          a-select(v-if="index > 0" v-model="condition.rel" :options="['and', 'or']")
          a-select.field(
            v-model="condition.field"
            allow-search
            placeholder="field"
            value-key="name"
            @change="() => handleFieldChange(condition)"
          )
            a-option(
              v-for="column in tableMap[inputTableName]"
              :key="column.label"
              :label="column.name"
              :value="column"
            )
          a-select.operator(
            v-model="condition.op"
            placeholder="operator"
            :options="getOpByField(condition.field && condition.field.name)"
          )
          a-input.value(v-model="condition.value" placeholder="value")
            template(#append)
              icon-minus(style="cursor: pointer; font-size: 14px" @click="() => removeCondition(index)")

      icon-plus(style="cursor: pointer; font-size: 14px" @click="addCondition")
  a-form-item(label="ORDER BY")
    a-space
      a-typography-text(v-if="tsColumn" code) {{ tsColumn.name }}
      a-select(v-model="form.orderBy" style="width: auto" :options="['DESC', 'ASC']")
      | LIMIT
      a-input-number(
        v-model="limit"
        style="width: 100px"
        :step="100"
        :max="1000"
        :min="1"
      )
</template>

<script setup name="SQLBuilder" lang="ts">
  import useLogQueryStore, { typeMap } from '@/store/modules/logquery'
  import type { Condition } from '@/views/dashboard/logs/query/types'

  const { tableMap, inputTableName, tsColumn, queryForm: form, limit } = storeToRefs(useLogQueryStore())

  // inputTableName.value = 'syslog'
  const tables = computed<Array<string>>(() => {
    return Object.keys(tableMap.value)
  })

  function addCondition() {
    if (!inputTableName.value) {
      return
    }
    form.value.conditions.push({
      field: null,
      op: '',
      value: '',
      rel: 'and',
    })
  }

  type TypeKey = keyof typeof typeMap
  const opMap = {
    String: ['contains', 'not contains', '=', '!=', 'like'],
    Number: ['=', '!=', '>', '>=', '<', '<='],
    Time: ['>', '>=', '<', '<='],
  }
  type OpKey = keyof typeof opMap

  function getOpByField(field: string): string[] {
    const fields = tableMap.value[inputTableName.value]
    const index = fields.findIndex((f) => f.name === field)
    if (index === -1) {
      return []
    }
    const type = fields[index].data_type as TypeKey
    const opKey = typeMap[type] as OpKey
    return opMap[opKey] || []
  }

  function removeCondition(index: number) {
    form.value.conditions.splice(index, 1)
  }

  function handleTableChange() {
    form.value.conditions = []
  }

  function handleFieldChange(condition: Condition) {
    if (!condition.field) {
      return
    }
    condition.op = getOpByField(condition.field.name)[0]
  }
</script>

<style lang="less" scoped>
  .arco-form-item {
    margin-bottom: 10px;
  }

  :deep(.operator .arco-select-view-value) {
    justify-content: center !important;
  }
  .input-group {
    justify-content: flex-start;
    align-items: flex-start;
    :deep(.field) {
      width: auto;
      flex: 0 0 auto;
    }
    :deep(.operator) {
      & .arco-select-view-input {
        width: 60px;
      }
      width: auto;
      flex: 0 0 auto;
    }
    :deep(.value) {
      width: 100px;
      flex: 0 0 auto;
    }
  }
  .condition-wrapper {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 20px;
    align-items: center;
  }
  :deep(.arco-input-append) {
    padding: 0 4px;
  }
  :deep(.arco-select-view-input) {
    width: 100px;
  }
  :deep(.arco-typography code) {
    color: inherit;
  }
</style>
