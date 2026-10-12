<template>
  <div class="tour-guide">
    <header class="tour-guide-header">
      <span class="gpt-sidebar-heading">{{ $t('tour.guide.title') }}</span>
      <a-tooltip :content="$t('tour.guide.close')" mini>
        <a-button class="tour-icon-btn" type="text" size="small" @click="tour.collapsePanel()">
          <template #icon>
            <icon-close />
          </template>
        </a-button>
      </a-tooltip>
    </header>

    <div class="tour-step-list">
      <button
        v-for="step in TOUR_STEPS"
        :key="step.id"
        type="button"
        class="tour-step-item"
        :class="{
          'tour-step-item--current': step.id === tour.activeStepId.value,
        }"
        @click="tour.goToStep(step.id)"
      >
        <span class="tour-step-item-icon">
          <component :is="ExploreIconComponent" v-if="step.id === 'signals-explore'" class="icon-18" />
          <svg v-else class="icon-18"><use :href="`#${step.icon}`" /></svg>
        </span>
        <span class="tour-step-item-title">{{ $t(step.nameKey) }}</span>
      </button>
    </div>

    <div v-if="activeStep" class="tour-detail">
      <header class="tour-step-header">
        <h3 class="tour-detail-title">{{ $t(activeStep.titleKey) }}</h3>
        <p class="tour-intro">{{ $t(`${stepKey}.intro`) }}</p>
      </header>

      <!-- Zone A: query / preset / where (already applied on the page) -->
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
              <dd>{{ $t(activeStep.preset.timeRangeKey) }}</dd>
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

        <p class="tour-zone-status">{{ loadedStatusText }}</p>
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

  const loadedStatusText = computed(() => {
    const display = activeStep.value?.display
    if (display === 'preset') return t('tour.guide.tryPreset')
    if (display === 'where') return t('tour.guide.tryWhere')
    return t('tour.guide.tryCode')
  })

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
    padding: 10px 12px 6px 16px;
  }

  .tour-icon-btn {
    color: var(--gpt-text-secondary);
  }

  .tour-step-list {
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 12px 10px 16px;
  }

  .tour-step-item {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    max-width: 100%;
    padding: 5px 10px;
    color: var(--gpt-text-secondary);
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    background: var(--gpt-bg-body);
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-md);
    transition: all 0.15s ease;

    &:hover {
      color: var(--gpt-text-primary);
      border-color: rgb(var(--primary-6));
    }

    &.tour-step-item--current {
      color: var(--gpt-text-primary);
      background: var(--gpt-nav-active-bg);
      border-color: rgb(var(--primary-6));
    }
  }

  .tour-step-item-icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    :deep(.icon-18),
    .icon-18 {
      color: currentColor;
      fill: currentColor;
    }
  }

  .tour-step-item-title {
    min-width: 0;
    overflow: hidden;
    font-size: var(--gpt-font-base);
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-detail {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0;
    min-height: 0;
    padding: 10px 16px 14px;
    overflow-y: auto;
    border-top: 1px solid var(--gpt-border-default);
  }

  .tour-step-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 4px;
  }

  .tour-detail-title {
    margin: 0;
    color: var(--gpt-text-primary);
    font-size: var(--gpt-font-xl);
    font-weight: 700;
    line-height: 1.35;
  }

  .tour-intro {
    margin: 0;
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-md);
    font-weight: 400;
    line-height: 1.65;
  }

  /* Zones: divider + title only (no card chrome). */
  .tour-zone {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--gpt-border-default);
  }

  .tour-zone-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 22px;
  }

  .tour-zone-label {
    color: var(--gpt-text-muted);
    font-size: var(--gpt-font-sm);
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .tour-zone-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .tour-zone-status {
    margin: 0;
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-base);
    font-weight: 400;
    line-height: 1.5;
  }

  .tour-code {
    margin: 0;
    padding: 10px 12px;
    overflow-x: auto;
    overflow-y: visible;
    color: var(--gpt-text-primary);
    font-size: var(--gpt-font-sm);
    line-height: 1.55;
    background: var(--gpt-bg-body);
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-md);
  }

  .tour-preset {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;

    .tour-preset-row {
      display: flex;
      gap: 8px;
      align-items: baseline;
    }

    dt {
      flex-shrink: 0;
      width: 68px;
      color: var(--gpt-text-muted);
      font-size: var(--gpt-font-sm);
    }

    dd {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 0;
      color: var(--gpt-text-secondary);
      font-size: var(--gpt-font-base);
    }

    code {
      padding: 1px 5px;
      color: var(--gpt-text-primary);
      font-size: var(--gpt-font-sm);
      background: var(--gpt-bg-body);
      border-radius: 4px;
    }
  }

  .tour-preset-chip {
    padding: 1px 7px;
    color: var(--gpt-text-primary);
    font-family: monospace;
    font-size: var(--gpt-font-sm);
    background: var(--gpt-bg-body);
    border: 1px solid var(--gpt-border-default);
    border-radius: 999px;
  }

  .tour-where-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      position: relative;
      padding-left: 12px;
      color: var(--gpt-text-secondary);
      font-size: var(--gpt-font-base);
      line-height: 1.55;

      &::before {
        position: absolute;
        top: 0.55em;
        left: 0;
        width: 4px;
        height: 4px;
        background: var(--gpt-text-muted);
        border-radius: 50%;
        content: '';
      }
    }
  }

  .tour-points {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tour-point {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tour-point-lead {
    color: var(--gpt-text-primary);
    font-size: var(--gpt-font-base);
    font-weight: 600;
    line-height: 1.45;
  }

  .tour-point-detail {
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-base);
    font-weight: 400;
    line-height: 1.55;
  }
</style>
