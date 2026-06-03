<template lang="pug">
a-space.top-bar.gpt-content-toolbar
  a-space(:size="15")
    slot(name="selector")
    a-button(
      v-if="hasButtons"
      type="primary"
      size="medium"
      :loading="loading"
      @click="emitSubmit"
    ) {{ submitLabel }}
  slot(name="extra")
</template>

<script lang="ts" setup name="TopBarIngest">
  const props = defineProps({
    disabled: {
      type: Boolean,
      default: false,
    },
    loading: {
      type: Boolean,
      default: false,
    },
    hasButtons: {
      type: Boolean,
      default: true,
    },
    submitLabel: {
      type: String,
      default: 'Submit',
    },
  })

  const emits = defineEmits(['submit'])

  const emitSubmit = () => {
    emits('submit')
  }
</script>

<style lang="less" scoped>
  .top-bar {
    :deep(.arco-select-view-value) {
      font-size: var(--gpt-font-md);
      color: var(--gpt-text-primary);
    }
    :deep(.arco-select-view-single) {
      width: 130px;
      border-color: var(--gpt-border-default);
    }
  }
</style>

<style lang="less">
  .arco-drawer-container.ingest {
    .arco-drawer {
      top: 20px;
      border: 1px solid var(--border-color);
      border-radius: var(--gpt-radius-sm);
      height: calc(100% - 20px - 26px);
      margin-right: 20px;
      box-shadow: 0px 2px 20px 0px var(--box-shadow-color);
      .arco-drawer-header {
        border: none;
        justify-content: flex-end;
        height: 30px;
        padding-right: 14px;
        align-items: flex-end;
      }
    }
    .arco-drawer-body {
      color: var(--gpt-text-primary);
      font-size: var(--gpt-font-md);
      padding: 0 var(--gpt-page-padding-x) var(--gpt-page-padding-x);
      a {
        color: var(--brand-color);
        font-size: var(--gpt-font-md);
        margin-left: var(--gpt-gap-xs);
      }
    }

    .markdown-container.ingest {
      margin-bottom: var(--gpt-gap-md);
      h3 {
        margin: 0 0 var(--gpt-gap-md);
      }
      pre {
        margin: 0;
        background: var(--gpt-bg-code);
        border-radius: var(--gpt-radius-sm);
        padding: 0 var(--gpt-gap-sm);
        color: var(--gpt-text-primary);
        line-height: 20px;

        code {
          font-size: var(--gpt-font-base);
          white-space: normal;
          line-height: 20px;
        }
      }
      p {
        margin: var(--gpt-gap-md) 0;
        font-size: var(--gpt-font-md);
      }
      code {
        font-size: var(--gpt-font-base);
      }

      ul {
        margin: var(--gpt-gap-md) 0;
      }
      li {
        margin: 0;
        font-size: var(--gpt-font-md);
      }
    }
  }
</style>
