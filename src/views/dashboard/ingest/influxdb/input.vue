<template lang="pug">
base-input(
  type="influxdb-input"
  :placeholder="placeholder"
  :process-function="processInfluxDB"
  :top-bar-component="InfluxdbTopBar"
  :has-doc="true"
)
</template>

<script lang="ts" setup>
  import { ref } from 'vue'

  const { writeInfluxDB } = useCodeRunStore()

  const placeholder = 'cpu_usage,host=server1,region=us-west usage_user=80,usage_system=10 1621401600000000000'

  const processInfluxDB = async (content, precision) => {
    await writeInfluxDB(content, precision)
  }
</script>
