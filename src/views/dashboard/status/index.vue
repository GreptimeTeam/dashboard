<template lang="pug">
a-modal.guide-modal(
  v-model:visible="statusModal"
  :mask-closable="false"
  :ok-text="$t('status.confirm')"
  :hide-cancel="true"
  :closable="false"
  @ok="handleOk"
)
  template(#title)
    div {{ $t('status.info') }}
    svg.guide-banner
      use(href="#banner")

a-layout.layout
  a-layout-content
    a-card(v-if="statusInfoRef && statusInfoRef.length > 0" title="GreptimeDB Status")
      template(#extra)
        a-button(type="text" @click="refreshStatus") refresh
        a-typography
          a-typography-paragraph(copyable @copy="copyToClipboard")
      a-descriptions(bordered :column="2")
        a-descriptions-item(v-for="item of statusInfoRef" :label="item[0]")
          a-tag {{ item[1] }}
    a-empty(v-else)
      template(#extra)
</template>

<script lang="ts" setup name="Status">
  import { getStatus } from '@/api/status'

  const statusModal = ref()
  const statusInfoRef = ref()

  const refreshStatus = async () => {
    const status = await getStatus()
    statusInfoRef.value = Object.entries(status)
  }

  const copyToClipboard = async () => {
    const status = await getStatus()
    navigator.clipboard.writeText(JSON.stringify(status))
    statusModal.value = true
  }

  const handleOk = () => {
    statusModal.value = false
  }

  onMounted(async () => {
    refreshStatus()
  })
</script>

<style lang="stylus" rel="stylesheet/stylus" scoped>
  .arco-layout-content
    background-color #fff
    border-radius 10px
    padding 10px 20px
</style>
