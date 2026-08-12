<template lang="pug">
teleport(to="body")
  transition(name="cp-fade")
    .command-palette-overlay(v-if="visible" @click.self="close")
      .command-palette
        .cp-header
          .cp-breadcrumb(v-if="currentParent")
            button.cp-back(@click="goBack")
              | ←
            span.cp-parent-label {{ currentParent.title }}
          input.cp-input(
            ref="inputRef"
            v-model="query"
            :placeholder="currentParent ? `Search ${currentParent.title}...` : 'Type a command or search...'"
            @keydown="onKeydown"
          )
          .cp-shortcut
            kbd {{ modKey }}
            kbd K
        .cp-body(ref="bodyRef")
          template(v-if="flatFiltered.length")
            template(v-for="section in filteredSections" :key="section.label")
              .cp-section-label {{ section.label }}
              .cp-item(
                v-for="(item, i) in section.items"
                :key="item.id"
                :class="{ 'cp-item--active': flatFiltered[selectedIndex]?.id === item.id }"
                :ref="(el) => setItemRef(item.id, el)"
                @click="select(item)"
                @mouseenter="selectedIndex = flatFiltered.indexOf(item)"
              )
                .cp-item-main
                  span.cp-item-title {{ item.title }}
                  span.cp-item-hint(v-if="item.kind === 'route'") {{ item.path }}
                  span.cp-item-hint(v-else-if="item.kind === 'ui' || item.kind === 'group'") {{ item.hint }}
                span.cp-item-arrow(v-if="item.kind === 'group'") →
          .cp-empty(v-else)
            | No results found.
</template>

<script lang="ts" setup>
  import { useCommandPalette } from './use-command-palette'
  import type { CommandPaletteItem } from './types'

  const {
    visible,
    query,
    filteredSections,
    flatFiltered,
    selectedIndex,
    currentParent,
    open,
    close,
    select,
    goBack,
    onKeydown,
  } = useCommandPalette()

  const inputRef = ref<HTMLInputElement>()
  const bodyRef = ref<HTMLElement>()
  const itemRefs = new Map<string, HTMLElement>()

  const isMac = navigator.platform.toUpperCase().includes('MAC')
  const modKey = isMac ? '⌘' : 'Ctrl'

  const setItemRef = (id: string, el: any) => {
    if (el) itemRefs.set(id, el as HTMLElement)
    else itemRefs.delete(id)
  }

  watch(visible, (val) => {
    if (val) {
      nextTick(() => inputRef.value?.focus())
    }
  })

  watch(selectedIndex, () => {
    const items = flatFiltered.value
    const current = items[selectedIndex.value]
    if (!current) return
    const el = itemRefs.get(current.id)
    el?.scrollIntoView({ block: 'nearest' })
  })

  defineExpose({ open, close })
</script>

<style scoped lang="less">
  .command-palette-overlay {
    position: fixed;
    inset: 0;
    z-index: 1100;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    background: rgba(0, 0, 0, 0.45);
  }

  .command-palette {
    display: flex;
    flex-direction: column;
    width: 600px;
    max-height: 520px;
    overflow: hidden;
    background: var(--gpt-bg-panel);
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-lg);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  }

  .cp-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--gpt-border-default);
  }

  .cp-breadcrumb {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .cp-back {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 14px;
    color: var(--gpt-text-secondary);
    background: var(--gpt-bg-surface);
    border: none;
    border-radius: var(--gpt-radius-sm);
    cursor: pointer;

    &:hover {
      color: var(--gpt-text-primary);
      background: var(--gpt-nav-active-bg);
    }
  }

  .cp-parent-label {
    color: var(--gpt-text-muted);
    font-size: 12px;
    margin-right: 4px;
  }

  .cp-input {
    flex: 1;
    height: 32px;
    padding: 0;
    font-size: 15px;
    color: var(--gpt-text-primary);
    background: transparent;
    border: none;
    outline: none;

    &::placeholder {
      color: var(--gpt-text-muted);
    }
  }

  .cp-shortcut {
    display: flex;
    gap: 4px;
    flex-shrink: 0;

    kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 4px;
      font-size: 11px;
      font-family: inherit;
      color: var(--gpt-text-muted);
      background: var(--gpt-bg-surface);
      border: 1px solid var(--gpt-border-default);
      border-radius: var(--gpt-radius-sm);
    }
  }

  .cp-body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .cp-section-label {
    padding: 8px 16px 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--gpt-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cp-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    cursor: pointer;
    transition: background 0.1s;

    &:hover,
    &.cp-item--active {
      background: var(--gpt-nav-active-bg);
    }
  }

  .cp-item-main {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
  }

  .cp-item-title {
    font-size: 14px;
    color: var(--gpt-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cp-item-hint {
    font-size: 12px;
    color: var(--gpt-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cp-item-arrow {
    flex-shrink: 0;
    color: var(--gpt-text-muted);
    font-size: 14px;
  }

  .cp-empty {
    padding: 24px 16px;
    text-align: center;
    color: var(--gpt-text-muted);
    font-size: 14px;
  }

  .cp-fade-enter-active,
  .cp-fade-leave-active {
    transition: opacity 0.15s ease;
  }

  .cp-fade-enter-from,
  .cp-fade-leave-to {
    opacity: 0;
  }
</style>
