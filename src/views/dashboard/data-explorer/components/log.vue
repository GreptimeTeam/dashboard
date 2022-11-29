<template>
  <a-list>
    <template #header> Logs </template>
    <a-list-item v-for="item of logListData" :key="item">
      <a-tooltip content="This is tooltip content">
        <a-alert type="error" v-if="item.error">
          {{ `Error: ${item.error}` }}
        </a-alert>
        <a-space v-else>
          <span>
            {{ item.resultRows ? `Result: ${item.resultRows} row(s)` : `Affected ${item.affectedRows} row(s)` }}
          </span>
          <span> Execute time: {{ item.executeTime }} ms </span>
          <span> Code: {{ item.runCode }}</span>
        </a-space>
      </a-tooltip>
      <template #actions> </template>
    </a-list-item>
  </a-list>
</template>

<script lang="ts" setup>
  import { storeToRefs } from 'pinia'
  import { useCodeRunStore } from '@/store'

  const codeRunStore = useCodeRunStore()
  const { logListData } = storeToRefs(codeRunStore)
</script>
