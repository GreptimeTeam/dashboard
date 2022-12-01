<template lang="pug">
a-spin(style="width: 100%")
  a-table(:columns="gridColumn" :data="gridData")
</template>

<script lang="ts" setup>
  const { gridColumn, gridData } = useDataExplorer()
</script>
