<template lang="pug">
.navigation-arrows
  a-button.nav-arrow.left(
    type="text"
    size="large"
    :disabled="isFirstNode"
    @click="$emit('prev')"
  )
    template(#icon)
      IconLeft
  a-button.nav-arrow.right(
    type="text"
    size="large"
    :disabled="isLastNode"
    @click="$emit('next')"
  )
    template(#icon)
      IconRight
</template>

<script lang="ts" setup name="NavigationArrows">
  import { IconLeft, IconRight } from '@arco-design/web-vue/es/icon'
  import { computed } from 'vue'

  const props = defineProps({
    availableNodes: {
      type: Array as () => number[],
      required: true,
    },
    activeNodeIndex: {
      type: Number,
      required: true,
    },
  })

  defineEmits(['prev', 'next'])

  const isFirstNode = computed(() => props.activeNodeIndex === props.availableNodes[0])

  const isLastNode = computed(() => props.activeNodeIndex === props.availableNodes[props.availableNodes.length - 1])
</script>

<style lang="less" scoped>
  .navigation-arrows {
    display: flex;
    gap: 16px;
    background-color: var(--card-bg-color);
    border-radius: 4px;
    padding: 4px 8px;
    box-shadow: 0 2px 5px var(--box-shadow-color);

    .nav-arrow {
      color: var(--main-font-color);

      &:hover:not(:disabled) {
        color: var(--brand-color);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
</style>
