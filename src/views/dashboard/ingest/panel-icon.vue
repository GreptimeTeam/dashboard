<template lang="pug">
a-tooltip.panel-icon(ref="panelIcon" position="tr" :content="tooltip")
  a-button.panel(type="text")
    template(#icon)
      svg.icon-18
        use(href="#log")
</template>

<script lang="ts" setup name="PanelIcon">
  const { footer, activeTab } = storeToRefs(useIngestStore())
  const tooltip = computed(() => {
    return footer.value[activeTab.value] ? 'Show Panel' : 'Hide Panel'
  })
</script>

<style lang="less" scoped>
  .arco-btn-size-medium.arco-btn-only-icon.arco-btn {
    height: 30px;
    width: 30px;
    border-radius: 0;
  }
</style>
