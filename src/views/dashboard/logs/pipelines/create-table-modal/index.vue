<template lang="pug">
a-modal(
  v-model:visible="visible"
  title="Create Pipeline Ingestion Table"
  :width="700"
  @ok="handleCreate"
  @cancel="visible = false"
)
  template(#footer)
    a-space
      a-button(@click="visible = false") Cancel
      a-button(type="primary" :loading="creating" @click="handleCreate") Create Table

  .create-table-content
    a-form-item(label="Table Name" style="background-color: var(--color-fill-2); padding: 16px; border-radius: 4px")
      a-input(v-model="tableName" placeholder="Enter table name" style="width: 200px; margin-right: 8px")
      a-button(type="outline" :loading="loadingDDL" @click="handleGetDDL") Get CREATE TABLE SQL from Pipeline

    .sql-content-section
      a-form(
        ref="formRef"
        layout="vertical"
        :model="formData"
        :rules="rules"
        @submit="handleCreate"
      )
        a-form-item(field="createTableSQL" label="CREATE TABLE SQL" required)
          YMLEditorSimple(
            v-model="formData.createTableSQL"
            language="sql"
            style="width: 100%; height: 300px; border: 1px solid var(--color-border); border-radius: 4px; overflow: hidden"
            placeholder="CREATE TABLE SQL"
          )
</template>

<script setup lang="ts">
  import { ref, reactive, computed, defineExpose } from 'vue'
  import { Notification } from '@arco-design/web-vue'
  import YMLEditorSimple from '@/components/yml-editor.vue'
  import editorAPI from '@/api/editor'
  import { getPipelineDDL } from '@/api/pipeline'

  const props = defineProps<{ pipelineName: string }>()
  const emit = defineEmits<{ (e: 'tableCreated'): void }>()

  const visible = ref(false)
  const creating = ref(false)
  const loadingDDL = ref(false)
  const tableName = ref('')
  const formRef = ref()

  const formData = reactive({
    createTableSQL: '',
  })

  const rules = {
    createTableSQL: [
      {
        required: true,
        message: 'Please enter table creation SQL',
      },
    ],
  }

  function open() {
    tableName.value = ''
    formData.createTableSQL = ''
    visible.value = true
  }
  defineExpose({ open })

  const handleGetDDL = async () => {
    if (!tableName.value.trim()) {
      Notification.warning('Please enter a table name')
      return
    }

    if (!props.pipelineName) {
      Notification.warning('Pipeline name is required to get DDL')
      return
    }

    try {
      loadingDDL.value = true
      formData.createTableSQL = await getPipelineDDL(props.pipelineName, tableName.value)
    } finally {
      loadingDDL.value = false
    }
  }

  const handleCreate = async () => {
    if (!formRef.value) return

    try {
      const valid = await formRef.value.validate()
      if (valid !== undefined) {
        // Validation failed, valid contains the error details

        return
      }

      creating.value = true
      await editorAPI.runSQL(formData.createTableSQL)
      emit('tableCreated')
      visible.value = false
      tableName.value = ''
      formData.createTableSQL = ''
      Notification.success('Table created successfully')
    } finally {
      creating.value = false
    }
  }
</script>

<style lang="less" scoped>
  .create-table-content {
    p {
      margin-bottom: 16px;
      color: var(--color-text-2);
    }
  }

  :deep(.arco-form-item-label) {
    font-weight: 500;
  }

  :deep(.arco-form-item-help) {
    margin-top: 4px;
  }
</style>
