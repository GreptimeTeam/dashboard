<template>
  <a-list :hoverable="true">
    <template #header> Logs </template>
    <a-list-item v-for="item of logListData" :key="item">
      <a-tooltip :content="item.error ? item.error : item.runCode">
        <div v-if="item.error" class="log-error">
          {{ `Error: ${item.error}` }}
        </div>
        <a-space v-else size="large">
          <template #split>
            <a-divider direction="vertical" />
          </template>
          <div>
            {{ item.resultRows ? `Result: ${item.resultRows} row(s)` : `Affected ${item.affectedRows} row(s)` }}
          </div>
          <div> Execute time: {{ item.executeTime }} ms </div>
          <div>
            Code:
            {{ item.runCode }}
          </div>
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

<style scoped>
  .log-error {
    background-color: var(--color-danger-light-1);
    padding: 0 2px;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }
  :deep(.arco-list-item-main) {
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }
</style>
