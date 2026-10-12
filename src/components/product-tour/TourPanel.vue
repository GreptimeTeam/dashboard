<template>
  <WelcomePanel />

  <!-- Docked mode: participates in the main layout, no overlay. -->
  <aside
    v-if="tour.layoutMode.value === 'docked'"
    v-show="tour.dockVisible.value"
    class="tour-dock"
    :style="{ width: `${tour.panelWidth.value}px` }"
  >
    <div class="tour-dock-resizer" @pointerdown="startResize" />
    <TourGuidePanel />
  </aside>

  <!-- Overlay modes: non-modal drawer (right) / bottom sheet. -->
  <a-drawer
    v-else
    class="tour-overlay-drawer"
    :visible="tour.panelOpen.value"
    :placement="drawerPlacement"
    :width="drawerPlacement === 'right' ? 600 : undefined"
    :height="drawerPlacement === 'bottom' ? '62%' : undefined"
    :mask="false"
    :footer="false"
    :header="false"
    :closable="false"
    unmount-on-close
  >
    <TourGuidePanel />
  </a-drawer>

  <teleport to="body">
    <button v-if="tour.pillVisible.value" type="button" class="tour-pill" @click="tour.openFromEntry()">
      <span class="tour-pill-label">{{ pillLabel }}</span>
    </button>
  </teleport>
</template>

<script setup lang="ts" name="TourPanel">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import WelcomePanel from './WelcomePanel.vue'
  import TourGuidePanel from './TourGuidePanel.vue'
  import { useProductTour } from './use-product-tour'

  const tour = useProductTour()
  const { t } = useI18n()

  const drawerPlacement = computed(() => (tour.layoutMode.value === 'sheet' ? 'bottom' : 'right'))

  const pillLabel = computed(() => {
    const step = tour.activeStep.value
    return step ? t(step.nameKey) : t('tour.guide.title')
  })

  function startResize(event: PointerEvent) {
    event.preventDefault()
    const onMove = (moveEvent: PointerEvent) => {
      tour.setPanelWidth(window.innerWidth - moveEvent.clientX)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('tour-resizing')
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    document.body.classList.add('tour-resizing')
  }
</script>

<style lang="less" scoped>
  .tour-dock {
    position: relative;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--gpt-bg-panel);
    border-left: 1px solid var(--gpt-border-strong);
  }

  .tour-dock-resizer {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 10;
    width: 6px;
    cursor: col-resize;

    &:hover {
      background: rgb(var(--primary-6) / 20%);
    }
  }

  .tour-pill {
    position: fixed;
    right: 20px;
    bottom: 24px;
    z-index: 1020;
    display: inline-flex;
    align-items: center;
    max-width: 260px;
    padding: 8px 14px;
    color: var(--gpt-text-primary);
    cursor: pointer;
    background: var(--gpt-bg-panel);
    border: 1px solid var(--gpt-border-default);
    border-radius: 999px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.14);

    &:hover {
      border-color: rgb(var(--primary-6));
    }
  }

  .tour-pill-label {
    overflow: hidden;
    color: var(--gpt-text-primary);
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(body.tour-resizing) {
    cursor: col-resize;
    user-select: none;
  }
</style>

<style lang="less">
  .tour-overlay-drawer {
    .arco-drawer {
      border-left: 1px solid var(--gpt-border-strong);
    }

    .arco-drawer-body {
      padding: 0;
      overflow: hidden;
    }
  }
</style>
