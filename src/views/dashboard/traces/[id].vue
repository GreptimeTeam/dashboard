<template lang="pug">
.query-layout.query-layout--stack.trace-detail-page.query-container
  .drilldown-detail-header
    .drilldown-drawer__standard-header
      .drilldown-drawer__title-text
        nav.drilldown-drawer__breadcrumb(:aria-label="$t('drilldown.nav.breadcrumb')")
          a-breadcrumb
            a-breadcrumb-item
              button.drilldown-drawer__crumb-link(type="button" @click="handleBack") {{ $t('drilldown.nav.overview') }}
            a-breadcrumb-item
              span.drilldown-drawer__crumb-current.is-mono(:title="traceId") {{ traceId }}
        span.drilldown-drawer__subtitle Trace Timeline
    button.drilldown-detail-header__close(type="button" :aria-label="$t('common.close')" @click="handleBack")
      icon-close
  .trace-detail-body
    TraceDetailPanel(:trace-id="traceId" :target="target")
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { IconClose } from '@arco-design/web-vue/es/icon'
  import { traceDetailTargetFromQuery } from '@/observability/traces/trace-detail-target'
  import TraceDetailPanel from './components/TraceDetailPanel.vue'

  defineOptions({
    name: 'TraceDetail',
  })

  const route = useRoute()
  const router = useRouter()

  const traceId = computed(() => String(route.params.id || '').trim())
  const target = computed(() => traceDetailTargetFromQuery(route.query))

  const handleBack = () => {
    if (window.history.state?.back) {
      router.back()
      return
    }
    router.push({ name: 'trace-query' })
  }

  // Same as the Signals Explore drawer: Esc closes the detail (ignored while typing / in popups).
  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented) {
      return
    }
    const origin = event.target as HTMLElement | null
    if (origin?.closest('input, textarea, [contenteditable="true"], .arco-select-dropdown, .arco-trigger-popup')) {
      return
    }
    handleBack()
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
</script>

<style lang="less" scoped>
  .trace-detail-body {
    display: flex;
    flex: 1 1 0%;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    background: var(--gpt-bg-panel);
  }
</style>
