<template>
  <a-list>
    <template #header> Logs </template>
    <a-list-item v-for="item of logListData" :key="item">
      <a-tooltip content="This is tooltip content">
        <a-space>
          <span> select rows: {{ item.rowCount }} </span>
          <span> execute time: {{ item.executeTime }} ms </span>
        </a-space>
      </a-tooltip>

      <template #actions>
        <icon-edit />
        <icon-delete />
      </template>
    </a-list-item>
  </a-list>
</template>

<script lang="ts" setup>
  import { storeToRefs } from 'pinia'
  import { useCodeRunStore } from '@/store'

  const codeRunStore = useCodeRunStore()
  const { logListData } = storeToRefs(codeRunStore)
</script>
