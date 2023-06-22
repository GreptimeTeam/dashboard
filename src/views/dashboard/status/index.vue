<template lang="pug">
a-layout.layout
  a-layout-content

    a-card(title='GreptimeDB Status')
      template(#extra)
        a-button(type="text" @click="refreshStatus") refresh
      a-descriptions(:column='2' bordered)
        a-descriptions-item(v-for='item of statusInfoRef', :label='item[0]')
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
  .arco-layout-content
    background-color #fff
    border-radius 10px
    padding 10px 20px
</style>
