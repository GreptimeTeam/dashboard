<template>
  <a-list :data="favoriteList">
    <template #header> Favorite </template>
    <template #item="{ item }">
      <a-list-item>
        <a-tooltip content="This is tooltip content">
          <a-list-item-meta :description="item.title"> </a-list-item-meta>
        </a-tooltip>
        <template #actions>
          <icon-edit @click="insertCode(item.title)" />
          <icon-delete />
        </template>
      </a-list-item>
    </template>
  </a-list>
</template>

<script lang="ts" setup>
  import { storeToRefs } from 'pinia'
  import useDataExplorer from '@/hooks/data-explorer'
  import { useDataBaseStore } from '@/store'

  const dataBaseStore = useDataBaseStore()
  const dataExplorer = useDataExplorer()

  const { insertCode } = dataExplorer

  const { favoriteList } = storeToRefs(dataBaseStore)

  dataBaseStore.fetchFavoriteData()
</script>
