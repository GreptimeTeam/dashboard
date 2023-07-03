<template lang="pug">
a-layout.layout
  a-layout-content
    a-card(title="GreptimeDB Status")
      template(#extra)
        a-button(type="text" @click="refreshStatus") refresh
      a-empty(v-if="!statusInfoRef")
        template(#image)
          svg.icon-32
            use(href="#empty")
        | Status is not supported until GreptimeDB v0.3.1
      a-descriptions(v-else bordered :column="2")
        a-descriptions-item(v-for="item of statusInfoRef" :label="item[0]")
          a-tag {{ item[1] }}
</template>

<script lang="ts" setup name="Status">
  import { getStatus } from '@/api/status'

  const statusInfoRef = ref()

  const refreshStatus = async () => {
    const status = await getStatus()
    statusInfoRef.value = Object.entries(status)
  }
  onMounted(async () => {
    refreshStatus()
  })
</script>

<style lang="stylus" rel="stylesheet/stylus" scoped>
  .arco-layout-content {
    background-color: #fff;
    border-radius: 10px;
    padding: 10px 20px;
  }
</style>
