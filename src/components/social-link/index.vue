<template lang="pug">
a.social-link(:href="link" target="_blank" rel="noopener" v-html="svg")
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import socialIcons from '@/assets/svg-list'

  const props = defineProps<{
    icon: string | { svg: string }
    link: string
  }>()

  const svg = computed(() => {
    if (typeof props.icon === 'object') return props.icon.svg
    return socialIcons[props.icon]
  })
</script>

<style scoped>
  .social-link {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 36px;
    height: 36px;
    color: #fff;
    transition: color 0.5s;
  }

  .social-link:hover {
    transition: color 0.25s;
  }

  .social-link > :deep(svg) {
    width: 36px;
    height: 36px;
    fill: currentColor;
  }
</style>
