<template lang="pug">
a-layout-header
  slot(name="top-bar")
a-layout-content.main-content
  slot
</template>

<script lang="ts" name="IngestMainContent" setup>
  // Common props for all ingest components
  const props = defineProps({
    type: {
      type: String,
      required: true,
    },
  })

  // Common setup - can be used by all ingest components
  const route = useRoute()
  const { pushLog } = useLog(route)
  const { activeTab, footer } = storeToRefs(useIngestStore())

  // Common function for setting active tab
  const setActiveTab = () => {
    activeTab.value = props.type
  }

  // Expose common functionality for child components
  defineExpose({
    pushLog,
    activeTab,
    footer,
    setActiveTab,
  })
</script>

<style lang="less" scoped>
  .main-content {
    height: 100%;
  }
</style>
