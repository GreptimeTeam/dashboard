<template lang="pug">
BaseInput(:config="config")
  template(#selector="{ config }")
    a-select(v-model="precision" size="medium" :options="precisionOptions")
  template(v-slot:extra="{ toggleDoc, docVisible }")
    a-tooltip(
      position="tr"
      trigger="hover"
      mini
      :content="$t('ingest.influxdbAbout')"
    )
      a-button(type="outline" size="medium" @click="toggleDoc")
        template(#icon)
          svg.icon-16.brand-color(v-if="!docVisible")
            use(href="#details")
          icon-close.icon-16(v-else)
  template(#doc-content)
    .markdown-container.ingest
      SimpleMarkdown(:md="doc")
    | {{ $t('ingest.influxdbDocPrefix') }}
    a(href="https://docs.greptime.com/user-guide/ingest-data/for-iot/influxdb-line-protocol" target="_blank") {{ $t('ingest.influxdbDocLink') }}
</template>

<script lang="ts" setup>
  import { useI18n } from 'vue-i18n'

  const { t } = useI18n()
  const { precision } = storeToRefs(useIngestStore())
  const { getInfluxdbInputConfig } = useIngest()

  const precisionOptions = computed(() => [
    { value: 'ns', label: t('ingest.nanoseconds') },
    { value: 'us', label: t('ingest.microseconds') },
    { value: 'ms', label: t('ingest.milliseconds') },
    { value: 's', label: t('ingest.seconds') },
  ])

  const config = getInfluxdbInputConfig(precision)

  const doc = Object.entries(import.meta.glob('../doc.md', { as: 'raw', eager: true }))[0][1]
</script>
