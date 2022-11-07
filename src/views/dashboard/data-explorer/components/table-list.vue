<template>
  <a-tree :data="treeData" />
</template>

<script lang="ts" setup>
  import { ref } from 'vue'

  const treeData = ref([
    {
      title: 'Trunk 0-0',
      key: '0-0',
    },
    {
      title: 'Trunk 0-1',
      key: '0-1',
      children: [
        {
          title: 'Branch 0-1-1',
          key: '0-1-1',
        },
      ],
    },
  ])
</script>
