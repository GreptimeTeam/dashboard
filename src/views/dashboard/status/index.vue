<template lang="pug">
a-layout.layout.status
  a-layout-content
    a-card(v-if="statusInfoRef && statusInfoRef.length > 0" title="GreptimeDB Status")
      template(#extra)
        a-button(type="text" @click="refreshStatus") refresh
        TextCopyable(copyTooltip="Copy to Clipboard" :data="JSON.stringify(statusData)" :showData="false")
      a-descriptions(bordered :column="2")
        a-descriptions-item(v-for="item of statusInfoRef" :label="item[0]")
          a-tag {{ item[1] }}
    EmptyStatus(v-else data="Status is not supported until GreptimeDB v0.3.1")
</template>

<script lang="ts" setup name="Status">
  import { getStatus } from '@/api/status'

  const statusModal = ref()
  const statusData = ref()
  const statusInfoRef = ref()

  const refreshStatus = async () => {
    statusData.value = await getStatus()
    statusInfoRef.value = Object.entries(statusData.value)
  }

  const handleOk = () => {
    statusModal.value = false
  }

  onMounted(async () => {
    refreshStatus()
  })
</script>

<style lang="less" scoped>
  .arco-layout-content {
    background-color: #fff;
    border-radius: 10px;
    padding: 10px 20px;
  }

  :deep(.arco-tag) {
    border-radius: 6px;
  }

  .status {
    .arco-typography {
      line-height: 32px;

      &.copy {
        margin-bottom: 0;
      }
    }
  }
</style>
