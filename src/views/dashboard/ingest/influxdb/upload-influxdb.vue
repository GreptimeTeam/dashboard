<template lang="pug">
BaseUpload(:config="config")
  template(#modal-selector)
    a-select(v-model="precision" size="small" :options="precisionOptions")
  template(v-slot:extra="{ toggleDoc, docVisible }")
    a-tooltip(
      content="About InfluxDB Line Protocol"
      position="tr"
      trigger="hover"
      mini
    )
      a-button(type="outline" size="small" @click="toggleDoc")
        template(#icon)
          svg.icon-16.brand-color(v-if="!docVisible")
            use(href="#document")
          icon-close.icon-16(v-else)
  template(#doc-content)
    .markdown-container.ingest
      SimpleMarkdown(:md="doc")
    | To learn more about influxdb line protocol on GreptimeDB, visit our
    a(href="https://docs.greptime.com/user-guide/ingest-data/for-iot/influxdb-line-protocol" target="_blank") documentation.
</template>

<script lang="ts" setup>
  const { precision } = storeToRefs(useIngestStore())

  const precisionOptions = [
    { value: 'ns', label: 'Nanoseconds' },
    { value: 'us', label: 'Microseconds' },
    { value: 'ms', label: 'Milliseconds' },
    { value: 's', label: 'Seconds' },
  ]

  const { getInfluxdbUploadConfig } = useIngest()
  const config = getInfluxdbUploadConfig(precision)

  const doc = Object.entries(import.meta.glob('../doc.md', { as: 'raw', eager: true }))[0][1]
</script>
