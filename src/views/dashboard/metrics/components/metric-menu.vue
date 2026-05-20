<template lang="pug">
a-dropdown.tree-menu-dropdown(trigger="click" position="right")
  a-button.menu-button(type="text" @click.stop)
    template(#icon)
      svg.icon.rotate-90
        use(href="#extra")
  template(#content)
    a-doption(@click.stop="handleInsert")
      template(#icon)
        svg.icon.icon-color
          use(href="#query")
      | Insert
    a-doption(@click.stop="handleCopy")
      template(#icon)
        svg.icon.icon-color
          use(href="#copy-new")
      | Copy
</template>

<script setup lang="ts">
  const props = defineProps<{
    nodeData: {
      type: 'metric' | 'label' | 'value'
      title: string
      labelName?: string
      value?: string
      metricName?: string
      children?: Array<{
        metricName: string
        labelName?: string
        value?: string
        type: 'metric' | 'label' | 'value'
      }>
    }
  }>()

  const emits = defineEmits<{
    (e: 'copyText', text: string): void
    (e: 'insertText', text: string): void
  }>()

  const getNodeExpression = () => {
    if (props.nodeData.type === 'metric') {
      return props.nodeData.metricName || props.nodeData.title
    }
    if (props.nodeData.type === 'value') {
      return `${props.nodeData.labelName}="${props.nodeData.value}"`
    }
    return props.nodeData.labelName || props.nodeData.title
  }

  const handleInsert = () => {
    emits('insertText', getNodeExpression())
  }

  const handleCopy = () => {
    emits('copyText', getNodeExpression())
  }
</script>
