import { computed, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStorage, useWindowSize } from '@vueuse/core'
import { Message } from '@arco-design/web-vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/store'
import { useQueryFocusMode } from '@/composables/use-query-focus-mode'
import { isQueryGuideEnabled } from '@/utils/query-guide-enabled'
import { getTourStep, isTourStepId, matchTourStepFromRoute, type TourStepId } from './tour-steps'

export type TourState = 'not_started' | 'active' | 'dismissed'
export type TourPanelLayout = 'docked' | 'drawer' | 'sheet'
export type TourPanelState = 'expanded' | 'collapsed'
/** Tutorial panel visibility — null means closed (pill / navbar can reopen). */
export type TourView = 'guide' | null

interface TourPersistedState {
  /** Welcome modal has been shown (or user started / dismissed it). */
  welcomeSeen: boolean
  tourState: TourState
  activeStepId: TourStepId | null
  panelState: TourPanelState
  panelWidth: number
}

const STORAGE_KEY = 'greptime-dashboard.tour.v1'
const DOCK_MIN_WIDTH = 400
const DOCK_MAX_WIDTH = 640
const DOCK_DEFAULT_WIDTH = 520
const DOCK_MODE_MIN_VIEWPORT = 1440
const DRAWER_MODE_MIN_VIEWPORT = 720

function defaultPersistedState(): TourPersistedState {
  return {
    welcomeSeen: false,
    tourState: 'not_started',
    activeStepId: null,
    panelState: 'collapsed',
    panelWidth: DOCK_DEFAULT_WIDTH,
  }
}

const state = useStorage<TourPersistedState>(STORAGE_KEY, defaultPersistedState(), undefined, {
  serializer: {
    read: (raw: string) => {
      try {
        return { ...defaultPersistedState(), ...JSON.parse(raw) }
      } catch {
        return defaultPersistedState()
      }
    },
    write: (value: TourPersistedState) => JSON.stringify(value),
  },
})

// Normalize legacy/partial values once.
if (!isTourStepId(state.value.activeStepId)) state.value.activeStepId = null
if (!['not_started', 'active', 'dismissed'].includes(state.value.tourState)) {
  state.value.tourState = 'dismissed' // legacy `completed` has no completion semantics anymore
}

const welcomeOpen = ref(false)
const view = ref<TourView>(null)

let initialized = false

export function useProductTour() {
  const route = useRoute()
  const router = useRouter()
  const { t } = useI18n()
  const appStore = useAppStore()
  const queryFocusMode = useQueryFocusMode()
  const { width: viewportWidth } = useWindowSize()

  const layoutMode = computed<TourPanelLayout>(() => {
    if (viewportWidth.value >= DOCK_MODE_MIN_VIEWPORT) return 'docked'
    if (viewportWidth.value >= DRAWER_MODE_MIN_VIEWPORT) return 'drawer'
    return 'sheet'
  })

  const tourActive = computed(() => state.value.tourState === 'active')
  const panelOpen = computed(() => view.value === 'guide' && !queryFocusMode.value)
  const dockVisible = computed(() => layoutMode.value === 'docked' && panelOpen.value)
  /** Always-on reopen entry when the guide panel (and welcome) are closed. */
  const pillVisible = computed(() => !panelOpen.value && !welcomeOpen.value && !queryFocusMode.value)

  const activeStep = computed(() => (state.value.activeStepId ? getTourStep(state.value.activeStepId) : null))
  function setActiveStep(stepId: TourStepId) {
    state.value.activeStepId = stepId
  }

  function syncPanelAfterNavigation() {
    if (layoutMode.value === 'docked') {
      view.value = 'guide'
      state.value.panelState = 'expanded'
      return
    }
    // Drawer / sheet: collapse to pill so the live page stays primary.
    view.value = null
    state.value.panelState = 'collapsed'
    const name = t(activeStep.value?.nameKey || 'tour.guide.title')
    Message.info(t('tour.guide.stepLoaded', { name }))
  }

  async function goToStep(stepId: TourStepId) {
    setActiveStep(stepId)
    const step = getTourStep(stepId)
    // `tourApply` forces same-route deep-link consumers (Table Query already open, etc.)
    // to re-apply SQL/builder state when the path+payload would otherwise be unchanged.
    await router.replace({
      path: step.location.path,
      query: {
        ...step.location.query,
        tourApply: `${stepId}-${Date.now()}`,
      },
    })
    syncPanelAfterNavigation()
  }

  /** Focus a step without forcing navigation (deep links, restore). */
  function focusStep(stepId: TourStepId) {
    setActiveStep(stepId)
    if (layoutMode.value === 'docked') {
      view.value = 'guide'
      state.value.panelState = 'expanded'
    } else {
      view.value = null
      state.value.panelState = 'collapsed'
    }
  }

  function openWelcome() {
    if (view.value === 'guide') return
    state.value.welcomeSeen = true
    welcomeOpen.value = true
  }

  /** Close welcome without starting the guide — pill / navbar can reopen. */
  function dismissWelcome() {
    state.value.welcomeSeen = true
    welcomeOpen.value = false
  }

  function beginTour() {
    welcomeOpen.value = false
    state.value.welcomeSeen = true
    state.value.tourState = 'active'
    state.value.activeStepId = 'sql'
    view.value = 'guide'
    state.value.panelState = 'expanded'
    goToStep('sql').catch(() => undefined)
  }

  function expandPanel() {
    if (!state.value.activeStepId) {
      beginTour()
      return
    }
    state.value.tourState = 'active'
    view.value = 'guide'
    state.value.panelState = 'expanded'
  }

  function collapsePanel() {
    view.value = null
    state.value.panelState = 'collapsed'
  }

  function endTour() {
    state.value.tourState = 'dismissed'
    view.value = null
    state.value.panelState = 'collapsed'
  }

  /** Navbar / command palette / pill — always reopens the guide. */
  function openFromEntry() {
    if (tourActive.value && state.value.activeStepId) {
      expandPanel()
      return
    }
    beginTour()
  }

  function setPanelWidth(width: number) {
    state.value.panelWidth = Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, Math.round(width)))
  }

  function routeFollow() {
    if (!tourActive.value) return
    const matched = matchTourStepFromRoute(route, state.value.activeStepId)
    if (matched && matched !== state.value.activeStepId) {
      setActiveStep(matched)
    }
  }

  async function consumeTourQuery() {
    const raw = route.query.tour
    if (raw === undefined) return
    const value = Array.isArray(raw) ? raw[0] : raw
    await router.replace({ query: { ...route.query, tour: undefined } })
    if (value === 'welcome') {
      openWelcome()
      return
    }
    if (isTourStepId(value)) {
      if (state.value.tourState !== 'active') state.value.tourState = 'active'
      state.value.welcomeSeen = true
      focusStep(value)
    }
  }

  /** Wire route/global listeners once from the default layout. */
  function setup() {
    if (initialized) return
    if (!isQueryGuideEnabled()) return
    initialized = true

    // Restore an in-flight tour after refresh.
    if (state.value.tourState === 'active' && state.value.panelState === 'expanded') {
      view.value = 'guide'
    }

    watch(() => route.fullPath, routeFollow)
    routeFollow()

    watch(
      () => route.query.tour,
      () => {
        consumeTourQuery().catch(() => undefined)
      }
    )
    consumeTourQuery().catch(() => undefined)

    // First visit: show welcome once (single CTA to begin the guide).
    watchEffect(() => {
      if (welcomeOpen.value || view.value === 'guide') return
      if (state.value.welcomeSeen) return
      if (appStore.guideModalVisible) return
      openWelcome()
    })

    // Docked panel participates in the main layout width via a CSS variable.
    watchEffect(() => {
      const width = dockVisible.value ? state.value.panelWidth : 0
      document.documentElement.style.setProperty('--tour-panel-current-width', `${width}px`)
    })
  }

  return {
    enabled: isQueryGuideEnabled(),
    // persisted state
    welcomeSeen: computed(() => state.value.welcomeSeen),
    tourState: computed(() => state.value.tourState),
    activeStepId: computed(() => state.value.activeStepId),
    panelState: computed(() => state.value.panelState),
    panelWidth: computed(() => state.value.panelWidth),
    // runtime state
    welcomeOpen,
    view,
    layoutMode,
    panelOpen,
    dockVisible,
    pillVisible,
    tourActive,
    activeStep,
    // actions
    setup,
    openWelcome,
    dismissWelcome,
    beginTour,
    expandPanel,
    collapsePanel,
    goToStep,
    endTour,
    openFromEntry,
    setPanelWidth,
    bounds: { min: DOCK_MIN_WIDTH, max: DOCK_MAX_WIDTH },
  }
}
