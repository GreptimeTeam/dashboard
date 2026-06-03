<template lang="pug">
.tree-row-actions(@click.stop)
  a-button.tree-action-btn(
    type="text"
    size="mini"
    :title="$t('metrics.sidebar.insert')"
    @click.stop="handleInsert"
  )
    template(#icon)
      svg.icon-14.icon-color
        use(href="#query")
  a-button.tree-action-btn(
    type="text"
    size="mini"
    :title="$t('metrics.sidebar.copy')"
    @click.stop="handleCopy"
  )
    template(#icon)
      svg.icon-14.icon-color
        use(href="#copy-new")
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

<style lang="less" scoped>
  .tree-row-actions {
    flex-shrink: 0;
    align-items: center;
  }

  .tree-action-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    color: var(--gpt-text-secondary);
    background: transparent;
    border: none;
    border-radius: var(--gpt-radius-sm);

    &:hover {
      color: var(--gpt-brand-900);
      background: var(--list-hover-color);
    }
  }
</style>
