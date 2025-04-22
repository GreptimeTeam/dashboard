<template lang="pug">
.zoom-controls
  a-button(type="text" size="mini" @click="$emit('zoom-in')")
    template(#icon)
      IconZoomIn
  a-button(type="text" size="mini" @click="$emit('reset-zoom')")
    template(#icon)
      IconRefresh
  a-button(type="text" size="mini" @click="$emit('zoom-out')")
    template(#icon)
      IconZoomOut
</template>

<script lang="ts" setup name="ZoomControls">
  import { IconZoomIn, IconZoomOut, IconRefresh } from '@arco-design/web-vue/es/icon'

  defineEmits(['zoom-in', 'zoom-out', 'reset-zoom'])
</script>
