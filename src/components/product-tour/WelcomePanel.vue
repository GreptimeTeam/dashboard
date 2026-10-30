<template>
  <a-modal
    class="tour-welcome-modal"
    :visible="tour.welcomeOpen.value"
    :title="$t('tour.welcome.title')"
    :footer="false"
    :closable="true"
    :mask-closable="true"
    :width="440"
    unmount-on-close
    @cancel="tour.dismissWelcome()"
  >
    <div class="tour-welcome">
      <div class="tour-welcome-body">
        <span class="tour-live-badge">
          <span class="tour-live-dot" />
          {{ $t('tour.welcome.badge') }}
        </span>
        <p class="tour-welcome-slogan">{{ $t('tour.welcome.slogan') }}</p>
        <p class="tour-welcome-intro">{{ $t('tour.welcome.intro') }}</p>
      </div>

      <footer class="tour-welcome-footer">
        <a-button type="primary" long @click="tour.beginTour()">
          {{ $t('tour.welcome.begin') }}
        </a-button>
      </footer>
    </div>
  </a-modal>
</template>

<script setup lang="ts" name="TourWelcomePanel">
  import { useProductTour } from './use-product-tour'

  const tour = useProductTour()
</script>

<style lang="less" scoped>
  .tour-welcome-body {
    padding: 0 0 var(--gpt-gap-md);
  }

  .tour-live-badge {
    display: inline-flex;
    gap: var(--gpt-gap-sm);
    align-items: center;
    padding: var(--gpt-gap-2xs) var(--gpt-gap-md);
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-base);
    background: var(--gpt-bg-surface);
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-sm);
  }

  .tour-live-dot {
    width: 7px;
    height: 7px;
    background: var(--success-color);
    border-radius: 50%;
  }

  .tour-welcome-slogan {
    margin: var(--gpt-gap-xl) 0 0;
    color: var(--gpt-text-primary);
    font-size: var(--gpt-font-xl);
    font-weight: var(--gpt-font-weight-control);
    line-height: 1.45;
    white-space: pre-line;
  }

  .tour-welcome-intro {
    margin: var(--gpt-gap-md) 0 0;
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-md);
    line-height: 1.7;
    white-space: pre-line;
  }

  .tour-welcome-footer {
    display: flex;
    flex-direction: column;
    gap: var(--gpt-gap-md);
    margin-top: var(--gpt-gap-2xl);
  }
</style>

<style lang="less">
  .tour-welcome-modal {
    .arco-modal-body {
      padding: 8px 24px 24px;
    }
  }
</style>
