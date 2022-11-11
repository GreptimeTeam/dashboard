<template>
  <a-list :data="favoriteList">
    <template #header> Favorite </template>
    <template #item="{ item }">
      <a-list-item>
        <a-tooltip content="This is tooltip content">
          <a-list-item-meta :description="item.title"> </a-list-item-meta>
        </a-tooltip>
        <template #actions>
          <a-tooltip content="Insert Code Into Editor" mini background-color="#722ED1">
            <icon-copy style="font-size: 20px" @click="insertCode(item.title)" />
          </a-tooltip>
          <icon-delete style="font-size: 20px" />
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
