<template lang="pug">
a-space.top-bar
  a-space(:size="15")
    a-select(
      v-model="precision"
      style="width: 140px"
      size="small"
      :options="precisionOptions"
    )
    a-button(
      type="primary"
      size="small"
      :loading="loading"
      :disabled="disabled"
      @click="clickSubmit"
    ) Write
  a-tooltip(
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
  :width="437"
  :footer="false"
  :header="false"
)
  .markdown-container.ingest
    MarkdownRender(:md="doc")
  | To learn more about influxdb line protocol on GreptimeDB, visit our
  a(href="https://docs.greptime.com/user-guide/write-data/influxdb-line" target="_blank") documentation
</template>

<script lang="ts" setup name="TopBar">
  const props = defineProps<{
    disabled: boolean
    loading: boolean
  }>()
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
    padding-bottom: 20px;
    background: var(--card-bg-color);
    :deep(.arco-select-view-value) {
      font-size: 13px;
      color: var(--main-font-color);
    }
    :deep(.arco-select-view-single) {
      background: transparent;
      border-color: var(--border-color);
    }
  }
</style>

<style lang="less">
  .arco-drawer-container.ingest {
    .arco-drawer {
      top: 54px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      height: calc(100% - 54px - 26px);
      margin-right: 20px;
      box-shadow: 0px 2px 20px 0px var(--box-shadow-color);
      .arco-drawer-header {
        border: none;
      }
    }
    .arco-drawer-body {
      color: var(--color-gray-3);
      font-size: 13px;
      a {
        color: var(--brand-color);
        font-size: 13px;
        margin-left: 4px;
      }
    }

    .markdown-container.ingest {
      margin-bottom: 10px;
      h3 {
        margin: 10px 0 10px;
      }
      pre {
        margin: 0;
        background: var(--color-code-bg);
        border-radius: 4px;
        padding: 0 6px;
        border: 1px solid var(--color-dark-primary-1);
        code {
          font-size: 12px;
          white-space: normal;
          font-size: 12px;
          color: var(--color-red-3);
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
