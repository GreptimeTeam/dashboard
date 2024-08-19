<template lang="pug">
a-space.top-bar
  a-space(:size="15")
    a-select(
      v-if="hasButtons"
      v-model="precision"
      size="small"
      :options="precisionOptions"
    )
    a-button(
      v-if="hasButtons"
      type="primary"
      size="small"
      :loading="loading"
      :disabled="disabled"
      @click="clickSubmit"
    ) Write
  a-tooltip(
    v-if="hasDoc"
    content="About InfluxDB Line Protocol"
    position="tr"
    trigger="hover"
    mini
  )
    a-button(type="outline" size="small" @click="visible = !visible")
      template(#icon)
        svg.icon-16.brand-color(v-if="!visible")
          use(href="#document")
        icon-close.icon-16(v-else)
a-drawer.ingest(
  v-model:visible="visible"
  placement="right"
  title=""
  :width="510"
  :footer="false"
)
  .markdown-container.ingest
    SimpleMarkdown(:md="doc")
  | To learn more about influxdb line protocol on GreptimeDB, visit our
  a(href="https://docs.greptime.com/user-guide/ingest-data/for-iot/influxdb-line-protocol" target="_blank") documentation.
</template>

<script lang="ts" setup name="TopBar">
  const props = defineProps({
    disabled: {
      type: Boolean,
      default: false,
    },
    loading: {
      type: Boolean,
      default: false,
    },
    hasDoc: {
      type: Boolean,
      default: true,
    },
    hasButtons: {
      type: Boolean,
      default: true,
    },
  })
  const emits = defineEmits(['submit'])

  const { precision } = storeToRefs(useIngestStore())
  const visible = ref(false)

  const clickSubmit = () => {
    emits('submit', precision.value)
  }

  const precisionOptions = [
    {
      value: 'ns',
      label: 'Nanoseconds',
    },
    {
      value: 'us',
      label: 'Microseconds',
    },
    {
      value: 'ms',
      label: 'Milliseconds',
    },
    {
      value: 's',
      label: 'Seconds',
    },
  ]

  const doc = Object.entries(import.meta.glob('./doc.md', { as: 'raw', eager: true }))[0][1]
</script>

<style lang="less" scoped>
  .top-bar {
    display: flex;
    justify-content: space-between;
    padding-right: 20px;
    height: 58px;
    background: var(--card-bg-color);
    :deep(.arco-select-view-value) {
      font-size: 13px;
      color: var(--main-font-color);
    }
    :deep(.arco-select-view-single) {
      width: 130px;
      background: transparent;
      border-color: var(--border-color);
    }
  }
</style>

<style lang="less">
  .arco-drawer-container.ingest {
    .arco-drawer {
      top: 20px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
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
      color: var(--color-p-text);
      font-size: 13px;
      padding: 0 16px 16px 16px;
      a {
        color: var(--brand-color);
        font-size: 13px;
        margin-left: 4px;
      }
    }

    .markdown-container.ingest {
      margin-bottom: 10px;
      h3 {
        margin: 0 0 10px;
      }
      pre {
        margin: 0;
        background: var(--color-code-bg);
        border-radius: 4px;
        padding: 0 6px;
        color: var(--color-code);
        line-height: 20px;

        code {
          font-size: 12px;
          white-space: normal;
          font-size: 12px;
          line-height: 20px;
        }
      }
      p {
        margin: 10px 0;
        font-size: 13px;
      }
      code {
        font-size: 12px;
      }

      ul {
        margin: 10px 0;
      }
      li {
        margin: 0px 0;
        font-size: 13px;
      }
    }
  }
</style>
