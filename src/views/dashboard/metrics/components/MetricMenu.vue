<template lang="pug">
a-dropdown.metric-menu(trigger="click" position="bl" :popup-container="'body'")
  a-button.menu-button(type="text" @click="handleMenuClick")
    template(#icon)
      svg.icon-14.rotate-90
        use(href="#extra")
  template(#content)
    // For label nodes - only show label name insertion
    template(v-if="nodeData.type === 'label'")
      a-doption(@click="handleInsertLabel")
        | Insert Label Name

    // For value nodes - show operators for label=value combinations
    template(v-else-if="nodeData.type === 'value'")
      a-doption(@click="handleInsertEquals")
        | {{ nodeData.labelName }}="{{ nodeData.value }}"
      a-doption(@click="handleInsertNotEquals")
        | {{ nodeData.labelName }}!="{{ nodeData.value }}"
      a-doption(@click="handleInsertRegexMatch")
        | {{ nodeData.labelName }}=~"{{ nodeData.value }}"
      a-doption(@click="handleInsertRegexNotMatch")
        | {{ nodeData.labelName }}!~"{{ nodeData.value }}"
</template>

<script setup lang="ts">
  const props = defineProps<{
    nodeData: {
      type: 'label' | 'value'
      title: string
      labelName?: string
      value?: string
      metricName?: string
    }
  }>()

  const emits = defineEmits<{
    (e: 'copyText', text: string): void
    (e: 'insertText', text: string): void
  }>()

  const handleMenuClick = (event: Event) => {
    event.stopPropagation()
  }

  // Handler for label nodes - insert just the label name
  const handleInsertLabel = () => {
    const text = `${props.nodeData.title}`
    emits('insertText', text)
  }

  // Handlers for value nodes with different operators
  const handleInsertEquals = () => {
    const text = `${props.nodeData.labelName}="${props.nodeData.value}"`
    emits('insertText', text)
  }

  const handleInsertNotEquals = () => {
    const text = `${props.nodeData.labelName}!="${props.nodeData.value}"`
    emits('insertText', text)
  }

  const handleInsertRegexMatch = () => {
    const text = `${props.nodeData.labelName}=~"${props.nodeData.value}"`
    emits('insertText', text)
  }

  const handleInsertRegexNotMatch = () => {
    const text = `${props.nodeData.labelName}!~"${props.nodeData.value}"`
    emits('insertText', text)
  }
</script>

<style scoped lang="less">
  .metric-menu {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
  }

  .menu-button {
    visibility: hidden;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;

    .icon-14 {
      width: 14px;
      height: 14px;
    }
  }
</style>
