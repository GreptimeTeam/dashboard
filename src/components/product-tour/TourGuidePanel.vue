<template>
  <div class="tour-guide">
    <header class="tour-guide-header">
      <span class="gpt-text-page-title">{{ $t('tour.guide.title') }}</span>
      <a-tooltip :content="$t('tour.guide.close')" mini>
        <a-button class="tour-icon-btn" type="text" size="small" @click="tour.collapsePanel()">
          <template #icon>
            <icon-close />
          </template>
        </a-button>
      </a-tooltip>
    </header>

    <div class="tour-step-nav">
      <p class="tour-step-nav-label">{{ $t('tour.guide.switchSteps') }}</p>
      <p class="tour-step-nav-hint">{{ $t('tour.guide.switchStepsHint') }}</p>
      <div class="tour-step-list">
        <button
          v-for="step in TOUR_STEPS"
          :key="step.id"
          type="button"
          class="tour-step-item"
          :class="{
            'tour-step-item--current': step.id === tour.activeStepId.value,
          }"
          @click="tour.selectStep(step.id)"
        >
          <span class="tour-step-item-icon">
            <component :is="ExploreIconComponent" v-if="step.id === 'signals-explore'" class="icon-18" />
            <svg v-else class="icon-18"><use :href="`#${step.icon}`" /></svg>
          </span>
          <span class="tour-step-item-title">{{ $t(step.nameKey) }}</span>
        </button>
      </div>
    </div>

    <div v-if="activeStep" class="tour-detail">
      <header class="tour-step-header">
        <h3 class="tour-detail-title">{{ $t(activeStep.titleKey) }}</h3>
        <p class="tour-intro">{{ $t(`${stepKey}.intro`) }}</p>
        <a-button
          v-if="activeStep.display === 'code' || activeStep.display === 'preset'"
          type="primary"
          size="small"
          long
          class="tour-run-example"
          @click="tour.runExample()"
        >
          {{ $t('tour.guide.runQuery') }}
        </a-button>
      </header>

      <!-- Zone A: query / preset / where shown in the guide (Run query syncs + executes) -->
      <section class="tour-zone tour-zone--loaded">
        <div v-if="activeStep.display === 'code' && activeStep.code" class="tour-zone-body">
          <header class="tour-zone-header">
            <span class="tour-zone-label">{{ $t('tour.guide.theQuery') }}</span>
            <a-button type="text" size="mini" @click="copyCode(activeStep.code)">
              <template #icon>
                <icon-copy />
              </template>
              {{ $t('copy') }}
            </a-button>
          </header>
          <pre class="tour-code"><code>{{ activeStep.code }}</code></pre>
        </div>

        <div v-else-if="activeStep.display === 'preset' && activeStep.preset" class="tour-zone-body">
          <header class="tour-zone-header">
            <span class="tour-zone-label">{{ $t('tour.guide.presetTitle') }}</span>
          </header>
          <dl class="tour-preset">
            <div class="tour-preset-row">
              <dt>{{ $t('tour.guide.table') }}</dt>
              <dd
                ><code>{{ activeStep.preset.table }}</code></dd
              >
            </div>
            <div class="tour-preset-row">
              <dt>{{ $t('tour.guide.filters') }}</dt>
              <dd>
                <span v-for="filter in activeStep.preset.filters" :key="filter" class="tour-preset-chip">
                  {{ filter }}
                </span>
              </dd>
            </div>
            <div class="tour-preset-row">
              <dt>{{ $t('tour.guide.sort') }}</dt>
              <dd
                ><code>{{ activeStep.preset.sort }}</code></dd
              >
            </div>
            <div class="tour-preset-row">
              <dt>{{ $t('tour.guide.limit') }}</dt>
              <dd
                ><code>{{ activeStep.preset.limit }}</code></dd
              >
            </div>
            <div class="tour-preset-row">
              <dt>{{ $t('tour.guide.timeRange') }}</dt>
              <dd
                ><code>{{ $t(activeStep.preset.timeRangeKey) }}</code></dd
              >
            </div>
          </dl>
        </div>

        <div v-else-if="activeStep.display === 'where'" class="tour-zone-body">
          <header class="tour-zone-header">
            <span class="tour-zone-label">{{ $t('tour.guide.whereToLook') }}</span>
          </header>
          <ul class="tour-where-list">
            <li v-for="item in whereItems" :key="item">{{ item }}</li>
          </ul>
        </div>
      </section>

      <!-- Zone B: How it works (explain) -->
      <section v-if="pointItems.length" class="tour-zone tour-zone--explain">
        <header class="tour-zone-header">
          <span class="tour-zone-label">{{ $t('tour.guide.zoneExplain') }}</span>
        </header>
        <ul class="tour-points">
          <li v-for="point in pointItems" :key="point.lead" class="tour-point">
            <span class="tour-point-lead">{{ point.lead }}</span>
            <span class="tour-point-detail">{{ point.detail }}</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts" name="TourGuidePanel">
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { Message } from '@arco-design/web-vue'
  import ExploreIconComponent from '@/assets/svg/explore.svg'
  import { TOUR_STEPS } from './tour-steps'
  import { useProductTour } from './use-product-tour'

  const tour = useProductTour()
  const { t } = useI18n()

  const activeStep = computed(() => tour.activeStep.value)
  const stepKey = computed(() => activeStep.value?.nameKey.replace(/\.name$/, '') ?? '')
  const pointItems = computed(() =>
    [0, 1, 2]
      .map((i) => ({
        lead: t(`${stepKey.value}.points.${i}.lead`),
        detail: t(`${stepKey.value}.points.${i}.detail`),
      }))
      .filter((point) => point.lead && !point.lead.startsWith('tour.'))
  )
  const whereItems = computed(() =>
    [0, 1, 2].map((i) => t(`${stepKey.value}.where.${i}`)).filter((item) => item && !item.startsWith('tour.'))
  )

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      Message.success(t('copied'))
    } catch {
      Message.error(t('copy'))
    }
  }
</script>

<style lang="less" scoped>
  /* Horizontal rhythm: --gpt-gap-xl (16) matches page content padding. */
  .tour-guide {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .tour-guide-header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    min-height: var(--gpt-size-region-bar);
    padding: var(--gpt-gap-md) var(--gpt-gap-xl);
    border-bottom: 1px solid var(--gpt-border-default);
  }

  .tour-icon-btn {
    color: var(--gpt-text-secondary);

    &:hover {
      color: var(--gpt-main-purple);
    }
  }

  .tour-step-nav {
    flex-shrink: 0;
    padding: var(--gpt-gap-lg) var(--gpt-gap-xl);
  }

  /* Section label — matches .gpt-text-section-title */
  .tour-step-nav-label {
    margin: 0;
    color: var(--gpt-text-primary);
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-bold);
  }

  .tour-step-nav-hint {
    margin: var(--gpt-gap-xs) 0 var(--gpt-gap-md);
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-base);
    font-weight: var(--gpt-font-weight-regular);
    line-height: 1.5;
  }

  .tour-step-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gpt-gap-md);
  }

  /* Align with outline / button-radio: radius-sm, strong border, purple accent. */
  .tour-step-item {
    display: inline-flex;
    gap: var(--gpt-gap-md);
    align-items: center;
    max-width: 100%;
    padding: var(--gpt-gap-md) var(--gpt-gap-lg);
    color: var(--gpt-text-primary);
    font-weight: var(--gpt-font-weight-control);
    text-align: left;
    cursor: pointer;
    background: var(--gpt-bg-panel);
    border: 1px solid var(--gpt-border-strong);
    border-radius: var(--gpt-radius-sm);
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;

    &:hover {
      color: var(--gpt-main-purple);
      border-color: var(--gpt-main-purple);
      background: var(--gpt-nav-active-bg);
    }

    &.tour-step-item--current {
      color: var(--gpt-main-purple);
      background: var(--gpt-nav-active-bg);
      border-color: var(--gpt-main-purple);
    }
  }

  .tour-step-item-icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    :deep(.icon-18),
    .icon-18 {
      width: 18px;
      height: 18px;
      color: currentColor;
      fill: currentColor;
    }
  }

  .tour-step-item-title {
    min-width: 0;
    overflow: hidden;
    font-size: var(--gpt-font-md);
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-detail {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0;
    min-height: 0;
    padding: var(--gpt-gap-lg) var(--gpt-gap-xl) var(--gpt-gap-xl);
    overflow-y: auto;
    border-top: 1px solid var(--gpt-border-default);
  }

  .tour-step-header {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-sm);
    margin-bottom: var(--gpt-gap-xs);
  }

  /* Content headline — same scale as panel title; long copy is the reading focus. */
  .tour-detail-title {
    margin: 0;
    color: var(--gpt-text-primary);
    font-size: var(--gpt-font-xl);
    font-weight: var(--gpt-font-weight-bold);
    line-height: 1.35;
  }

  /* Body prose under the step title — primary (main-dark) for readability. */
  .tour-intro {
    margin: 0;
    color: var(--gpt-text-primary);
    font-size: var(--gpt-font-lg);
    font-weight: var(--gpt-font-weight-regular);
    line-height: 1.65;
  }

  .tour-run-example {
    margin-top: var(--gpt-gap-xs);
  }

  /* Zones: divider + section title (no card chrome). */
  .tour-zone {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-md);
    margin-top: var(--gpt-gap-xl);
    padding-top: var(--gpt-gap-lg);
    border-top: 1px solid var(--gpt-border-default);
  }

  .tour-zone-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 22px;
  }

  .tour-zone-label {
    color: var(--gpt-text-primary);
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-bold);
  }

  .tour-zone-body {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-md);
    min-width: 0;
  }

  .tour-code {
    margin: 0;
    padding: var(--gpt-gap-md) var(--gpt-gap-lg);
    overflow-x: auto;
    overflow-y: visible;
    color: var(--gpt-text-primary);
    font-family: var(--font-mono);
    font-size: var(--gpt-font-base);
    line-height: 1.55;
    background: var(--gpt-bg-panel);
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-sm);
  }

  .tour-preset {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-sm);
    margin: 0;

    .tour-preset-row {
      display: flex;
      gap: var(--gpt-gap-md);
      align-items: baseline;
    }

    dt {
      flex-shrink: 0;
      width: 72px;
      color: var(--gpt-text-muted);
      font-size: var(--gpt-font-base);
    }

    dd {
      display: flex;
      flex-wrap: wrap;
      gap: var(--gpt-gap-xs);
      margin: 0;
      color: var(--gpt-text-primary);
      font-size: var(--gpt-font-md);
    }

    code {
      padding: 1px var(--gpt-gap-xs);
      color: var(--gpt-text-primary);
      font-family: var(--font-mono);
      font-size: var(--gpt-font-base);
      background: var(--gpt-bg-panel);
      border-radius: var(--gpt-radius-sm);
    }
  }

  .tour-preset-chip {
    padding: 1px 7px;
    color: var(--gpt-text-primary);
    font-family: var(--font-mono);
    font-size: var(--gpt-font-base);
    background: var(--gpt-bg-panel);
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-sm);
  }

  .tour-where-list {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-sm);
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      position: relative;
      padding-left: var(--gpt-gap-lg);
      color: var(--gpt-text-primary);
      font-size: var(--gpt-font-md);
      line-height: 1.55;

      &::before {
        position: absolute;
        top: 0.55em;
        left: 0;
        width: var(--gpt-gap-xs);
        height: var(--gpt-gap-xs);
        background: var(--gpt-text-muted);
        border-radius: 50%;
        content: '';
      }
    }
  }

  .tour-points {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-md);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tour-point {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-2xs);
  }

  .tour-point-lead {
    color: var(--gpt-text-primary);
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-control);
    line-height: 1.45;
  }

  .tour-point-detail {
    color: var(--gpt-text-primary);
    font-size: var(--gpt-font-md);
    font-weight: var(--gpt-font-weight-regular);
    line-height: 1.55;
  }
</style>
