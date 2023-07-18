<template lang="pug">
a-typography-text(copyable type="secondary" :copy-text="data")
  span(v-if="showData") {{ data }}
  template(#copy-icon="{ copied }")
    .icon-18.pointer
      svg.icon(v-if="copied === false")
        use(href="#copy")
      svg.icon(v-else)
        icon-check.success-color
  template(#copy-tooltip="{ copied }")
    | {{ copied ? copiedTooltip : copyTooltip }}
</template>

<script lang="ts" setup name="TextCopyable">
  defineProps({
    data: {
      type: String,
      default: '',
    },
    showData: {
      type: Boolean,
      default: true,
    },
    copyTooltip: {
      type: String,
      default: 'Copy',
    },
    copiedTooltip: {
      type: String,
      default: 'Copied',
    },
  })
</script>

<style lang="less" scoped>
  .arco-typography {
    display: flex;
  }
</style>
