<template lang="pug">
a-list(:data="favoriteList")
  template(#header)
    | {{ $t('dashboard.favorite') }}
  template(#item="{ item }")
    a-list-item
      a-list-item-meta(:description="item.title")
      template(#actions)
        a-tooltip(mini background-color="#722ED1" :content="$t('dashboard.favoriteInsertHint')")
          icon-copy(style="font-size: 20px")
        icon-delete(style="font-size: 20px")
</template>

<script lang="ts" setup></script>
