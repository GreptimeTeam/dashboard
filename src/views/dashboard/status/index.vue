<template lang="pug">
a-layout.layout
  a-layout-content
    div {{ statusInfoRef }}
</template>

<script lang="ts" setup name="Status">
import { getStatus } from '@/api/status'

const statusInfoRef = ref()

onMounted(async () => {
  const status = await getStatus();
  statusInfoRef.value = status
})

</script>

<style lang="stylus" rel="stylesheet/stylus" scoped>

</style>
