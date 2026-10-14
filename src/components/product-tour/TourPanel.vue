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
    if (!step) return t('tour.guide.title')
    return t('tour.guide.pillWithStep', { name: t(step.nameKey) })
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
    /* Page canvas chrome; seam = divider rail + elevated shadow (not full-panel tint). */
    background: var(--gpt-bg-app);
    border-left: 1px solid var(--gpt-border-strong);

    &::before {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 11;
      width: var(--gpt-divider-band-size);
      pointer-events: none;
      background: var(--gpt-bg-divider-band);
      content: '';
    }
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
      background: var(--gpt-nav-active-bg);
    }
  }

  .tour-pill {
    position: fixed;
    right: var(--gpt-gap-2xl);
    bottom: var(--gpt-gap-3xl);
    z-index: 1020;
    display: inline-flex;
    align-items: center;
    max-width: 320px;
    padding: var(--gpt-gap-md) var(--gpt-gap-xl);
    color: var(--gpt-text-primary);
    cursor: pointer;
    background: var(--gpt-bg-panel);
    border: 1px solid var(--gpt-border-strong);
    border-radius: var(--gpt-radius-sm);
    box-shadow: var(--gpt-shadow-sm);

    &:hover {
      color: var(--gpt-main-purple);
      border-color: var(--gpt-main-purple);
    }
  }

  .tour-pill-label {
    overflow: hidden;
    color: inherit;
    font-size: var(--gpt-font-base);
    font-weight: var(--gpt-font-weight-control);
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
      background: var(--gpt-bg-app);
      border-left: 1px solid var(--gpt-border-strong);
      box-shadow: -12px 0 28px rgba(71, 52, 96, 0.12);

      &::before {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        z-index: 1;
        width: var(--gpt-divider-band-size);
        pointer-events: none;
        background: var(--gpt-bg-divider-band);
        content: '';
      }
    }

    .arco-drawer-body {
      padding: 0;
      overflow: hidden;
      background: transparent;
    }
  }
</style>
