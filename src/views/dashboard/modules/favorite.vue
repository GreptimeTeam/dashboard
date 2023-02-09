<template lang="pug">
a-list(:data="favoriteList")
  template(#header)
    | Favorite
  template(#item="{ item }")
    a-list-item
      a-tooltip(content="This is tooltip content")
        a-list-item-meta(:description="item.title")
      template(#actions)
        a-tooltip(content="Insert Code Into Editor" mini background-color="#722ED1")
          icon-copy(style="font-size: 20px")
        icon-delete(style="font-size: 20px")
</template>

<script lang="ts" setup>
  import { storeToRefs } from 'pinia'

  const dataBaseStore = useDataBaseStore()
  const dataExplorer = useDataExplorer()

  const { favoriteList } = storeToRefs(dataBaseStore)
</script>
