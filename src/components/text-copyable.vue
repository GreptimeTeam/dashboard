<template lang="pug">
a-typography-text(
  copyable
  type="secondary"
  :copy-text="data"
  @copy="emit('copy')"
  :class="class"
  :copy-delay="1000"
  :copy-tooltip-props="{ 'mini' : true }"
)
  span(v-if="showData") {{ data }}
  template(#copy-icon="{ copied }")
    a-button(type="text")
      template(#icon)
        svg.icon.icon-color(v-if="copied === false")
          use(href="#copy-new")
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
    class: {
      type: String,
      default: '',
    },
  })

  const emit = defineEmits(['copy'])
</script>

<style lang="less" scoped>
  .arco-typography {
    display: flex;
  }

  .no-hover-bg {
    > :deep(.arco-typography-operation-copy:hover) {
      background-color: inherit;
    }
  }

  :deep(.arco-typography-operation-copy:hover) {
    color: inherit;
    background-color: inherit;
  }

  .icon {
    width: 20px;
    height: 20px;
  }
</style>
