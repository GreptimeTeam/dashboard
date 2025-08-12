<template lang="pug">
a-dropdown.metric-menu(trigger="click" position="bl" :popup-container="'body'")
  a-button.menu-button(type="text" @click="handleMenuClick")
    template(#icon)
      svg.icon-14.rotate-90
        use(href="#extra")
  template(#content)
    a-doption(@click="handleCopy")
      template(#icon)
        svg.icon
          use(href="#copy-new")
      | Copy {{ getItemType() }}
    a-doption(@click="handleInsert")
      template(#icon)
        svg.icon
          use(href="#insert")
      | Insert {{ getItemType() }}
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

  const getItemType = () => {
    return props.nodeData.type === 'label' ? 'Label' : 'Value'
  }

  const getTextContent = () => {
    if (props.nodeData.type === 'label') {
      return `${props.nodeData.title}=""`
    }
    if (props.nodeData.type === 'value') {
      return `${props.nodeData.labelName}="${props.nodeData.value}"`
    }
    return props.nodeData.title
  }

  const handleMenuClick = (event: Event) => {
    event.stopPropagation()
  }

  const handleCopy = () => {
    const text = getTextContent()
    emits('copyText', text)
  }

  const handleInsert = () => {
    const text = getTextContent()
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
