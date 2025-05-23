<template lang="pug">
router-view(v-slot="{ Component }")
  keep-alive
    component(:is="Component")
</template>

<script lang="ts" setup name="LogIngestion">
  // Simple wrapper component for log ingestion routes
</script>
