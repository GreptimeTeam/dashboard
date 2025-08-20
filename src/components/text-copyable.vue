<template lang="pug">
a-typography-text(
  copyable
  type="secondary"
  :copy-text="data"
  @copy="emit('copy')"
  :class="class"
  :copy-delay="1000"
  :size="size"
  :copy-tooltip-props="{ 'mini' : true }"
)
  span(v-if="showData") {{ data }}
  template(#copy-icon="{ copied }")
    a-button(:type="type" :size="size" )
      template(#icon)
        svg.icon(v-if="copied === false")
          use(href="#copy-new")
        svg.icon(v-else)
          icon-check.success-color
      template(#default v-if="buttonText")
        | {{ copied ? copiedTooltip : copyTooltip }}
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
    type: {
      type: String as () => 'text' | 'secondary' | 'dashed' | 'outline' | 'primary',
      default: 'text',
    },
    size: {
      type: String as () => 'mini' | 'small' | 'medium' | 'large',
      default: 'medium',
    },
    buttonText: {
      type: Boolean,
      default: false,
    },
  })

  const emit = defineEmits(['copy'])
</script>

<style lang="less" scoped>
  .arco-typography {
    display: flex;
    align-items: center;
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

  .arco-btn-size-mini {
    .icon {
      width: 12px;
      height: 12px;
    }
  }
</style>
