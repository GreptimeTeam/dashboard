<template lang="pug">
a-empty(:description="data")
  template(#image)
    svg(:class="iconClass")
      use(href="#empty")
</template>

<script lang="ts" setup name="EmptyStatus">
  defineProps({
    data: {
      type: String,
      default: '',
    },
    iconClass: {
      type: String,
      default: 'icon-32',
    },
  })
</script>
