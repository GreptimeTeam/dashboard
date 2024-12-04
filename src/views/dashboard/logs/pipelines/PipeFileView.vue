<template lang="pug">
a-page-header(title="Pipeline Configuration" :show-back="false")

a-alert Pipeline is a mechanism in GreptimeDB for parsing and transforming log data, <a href="https://docs.greptime.com/user-guide/logs/pipeline-config" target="_blank">read more</a>
a-layout(style="box-shadow: 0 2px 5px 0 rgba(0, 0, 0, 0.08)")
  a-layout-sider(:resize-directions="['right']" :width="650")
    a-card(title="Pipeline" :bordered="false")
      template(#extra)
        a-space
          a-button(type="primary" size="small" @click="handleSave")
            | Save
          a-popconfirm(content="Are you sure you want to delete?" @ok="handleDelete")
            a-button(
              v-if="!isCreating"
              type="text"
              status="warning"
              size="small"
            )
              | Delete
      a-form(
        ref="formRef"
        layout="vertical"
        style="padding: 0 10px; margin-top: 20px"
        :model="currFile"
        :disabled="!isCreating"
        :rules="rules"
      )
        a-form-item(field="name" label="Pipeline name" style="width: 200px")
          a-input(v-model="currFile.name" placeholder="Pipeline name")
        a-form-item(v-if="!isCreating" field="version" label="Version")
          | {{ currFile.version }}
        a-form-item(field="content" label="Yaml Content")
          template(#help)
            div 
          YMLEditorSimple(v-model="currFile.content" style="width: 100%; height: 525px")
  a-layout-content
    div(v-if="!isCreating" style="display: flex; flex-direction: column")
      a-card.light-editor-card(title="Input" style="flex: 1" :bordered="false")
        template(#extra)
          a-space
            a-button(size="small" @click="handleDebug") Test
            //- a(href="https://github.com/GreptimeTeam/demo-scene/tree/main/vector-ingestion" target="_blank") Write Log Demo

        .right-content
          a-alert(v-if="ymlError" type="error")
            | {{ ymlError }}
          a-typography-text(type="secondary")
            | Input your original log to see parse results.
          CodeMirror(
            v-model="debugForm.content"
            style="height: 320px; width: 100%; margin-top: 5px"
            :extensions="extensions"
            :spellcheck="true"
            :autofocus="true"
            :indent-with-tab="true"
            :tabSize="2"
            :placeholder="debugTip"
          )

      a-card.light-editor-card(title="Output" style="flex: 1" :bordered="false")
        .right-content
          a-typography-text(type="secondary")
            | Parsed logs displayed here. Logs that ingested via API will follow this structure.
          CodeMirror(
            style="height: 340px; width: 100%; margin-top: 5px"
            :model-value="debugResponse"
            :extensions="extensions"
            :spellcheck="true"
            :autofocus="true"
            :indent-with-tab="true"
            :tabSize="2"
            :disabled="true"
          )
    a-card(v-else style="padding: 20px; border: none")
      | After Create Pipeline, you can <a href="https://docs.greptime.com/user-guide/logs/manage-pipelines#debug-writing-logs" target="_blank">debug writing log</a> online.
</template>

<script setup name="PipeFileView" lang="ts">
  import { Notification } from '@arco-design/web-vue'
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'
  import { json } from '@codemirror/lang-json'
  import { create, list, del, debug, getByName } from '@/api/pipeline'
  import type { PipeFile } from '@/api/pipeline'

  const emit = defineEmits(['refresh'])
  const props = defineProps<{
    filename: undefined | string
  }>()

  const debugTip = JSON.stringify({ demoLogKey: 'demo log data' }, null, 2)
  const currFile = reactive<PipeFile>({
    name: '',
    content: `processors:
  - dissect:
      fields:
        - message
      patterns:
        - '%{ip_address} - %{user} [%{request_time}] "%{http_method} %{request_path} HTTP/%{http_version}" %{status_code} %{response_size}'
      ignore_missing: true
  - date:
      fields:
        - request_time
      formats:
        # 29/Oct/2024:17:51:29 +0800
        - "%d/%b/%Y:%H:%M:%S %z"

transform:
  - fields:
      - ip_address
      - http_method
      - http_version
    type: string
    index: tag
  - fields:
      - status_code
    type: int32
    index: tag
  - fields:
      - request_path
    type: string
    index: fulltext
  - fields:
      - user
    type: string
  - fields:
      - response_size
    type: int32
  - fields:
      - request_time
    type: time
    index: timestamp`,
    version: '',
  })

  const route = useRoute()
  const isCreating = computed(() => {
    return !props.filename
  })

  const formRef = ref()

  const appStore = useAppStore()

  const handleSave = () => {
    formRef.value?.validate((error: any) => {
      if (error) {
        return error
      }
      return create(currFile)
        .then(() => {
          Notification.success('Save Successful')
          emit('refresh')
        })
        .then(() => {
          getByName(currFile.name).then((fileResult) => {
            Object.assign(currFile, fileResult)
          })
        })
    })
  }

  const handleDelete = () => {
    del(currFile.name, currFile.version).then(() => {
      emit('del')
    })
  }

  const rules = {
    name: [
      {
        required: true,
      },
    ],
    content: [
      {
        required: true,
      },
    ],
  }

  const debugForm = reactive({
    content: '',
  })

  const extensions = [basicSetup, json()]
  const debugResponse = ref('')
  function handleDebug() {
    let content
    try {
      content = JSON.parse(debugForm.content)
    } catch (e) {
      content = null
    }
    debug(currFile.name, debugForm.content).then((result) => {
      debugResponse.value = JSON.stringify(result, null, 2)
    })
  }

  const ymlError = ref('')

  function getData() {
    const name = props.filename
    if (name) {
      getByName(name).then((result) => {
        Object.assign(currFile, result)
      })
    }
  }
  getData()
</script>

<style lang="less" scoped>
  :deep(.arco-card) {
    border-radius: 0;
    border-bottom: none;
  }
  .right-content {
    padding: 0 10px 10px 10px;
  }
  :deep(.arco-card.light-editor-card) {
    padding-right: 0;
  }
  :deep(.arco-layout-sider-light) {
    box-shadow: none;
  }
</style>
