<template lang="pug">
BaseUpload(:config="config")
  template(#selector)
    a-space(:size="15")
      .select-item
        span.label Table
        a-select(
          v-model="tableForPipeline"
          size="small"
          placeholder="Select table"
          :options="tableOptions"
          :loading="tableLoading"
          :style="{ minWidth: '180px', width: 'auto' }"
          :trigger-props="{ autoFitPopupMinWidth: true }"
        )
      .select-item
        span.label Pipeline
        a-select(
          v-model="pipelineName"
          size="small"
          placeholder="Select pipeline"
          :options="pipelineOptions"
          :loading="pipelineLoading"
          :trigger-props="{ autoFitPopupMinWidth: true }"
        )
  template(#modal-selector)
    a-space(:size="15")
      .select-item
        span.label Table
        a-select(
          v-model="tableForPipeline"
          size="small"
          placeholder="Select table"
          :options="tableOptions"
          :loading="tableLoading"
          :style="{ minWidth: '180px', width: 'auto' }"
          :dropdown-style="{ minWidth: '180px', width: 'auto', maxWidth: '400px' }"
        )
      .select-item
        span.label Pipeline
        a-select(
          v-model="pipelineName"
          size="small"
          placeholder="Select pipeline"
          :options="pipelineOptions"
          :loading="pipelineLoading"
        )
</template>

<script lang="ts" setup>
  const ingestStore = useIngestStore()
  const dataBaseStore = useDataBaseStore()

  const { pipelineName, tableForPipeline, pipelineOptions, pipelineLoading } = storeToRefs(ingestStore)

  const tableOptions = computed(() => {
    return dataBaseStore.originTablesTree.map((table) => ({
      label: table.title,
      value: table.title,
    }))
  })

  const tableLoading = computed(() => dataBaseStore.tablesLoading)

  onActivated(async () => {
    await dataBaseStore.checkTables()
    await ingestStore.fetchPipelines()
    if (tableOptions.value.length > 0 && !tableForPipeline.value) {
      tableForPipeline.value = tableOptions.value[0].value
    }

    if (pipelineOptions.value.length > 0 && !pipelineName.value) {
      pipelineName.value = pipelineOptions.value[0].value
    }
  })

  const { getLogIngestionUploadConfig } = useIngest()
  const config = getLogIngestionUploadConfig(pipelineName, tableForPipeline)
</script>

<style lang="less" scoped>
  .select-item {
    display: flex;
    align-items: center;

    .label {
      margin-right: 6px;
      white-space: nowrap;
      font-size: 12px;
    }
  }
</style>
