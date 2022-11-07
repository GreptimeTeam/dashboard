<template>
  <a-list>
    <template #header> Logs </template>
    <a-list-item v-for="idx in 3" :key="idx">
      <a-tooltip content="This is tooltip content">
        <a-list-item-meta description="Select * from list"> </a-list-item-meta>
      </a-tooltip>

      <template #actions>
        <icon-edit />
        <icon-delete />
      </template>
    </a-list-item>
  </a-list>
</template>

<script lang="ts" setup></script>
