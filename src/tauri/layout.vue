<template lang="pug">
router-view(v-slot="{ Component }")
  transition(name="fade" mode="out-in" appear)
    component(:is="Component")
</template>

<script lang="ts" setup name="ClientLayout"></script>

<style scoped lang="less"></style>
