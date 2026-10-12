<template>
  <a-modal
    class="tour-welcome-modal"
    :visible="tour.welcomeOpen.value"
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
        <h2 class="tour-welcome-title">{{ $t('tour.welcome.title') }}</h2>
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
    padding: 4px 4px 8px;
  }

  .tour-live-badge {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    padding: 2px 10px;
    color: var(--gpt-text-secondary);
    font-size: 12px;
    background: var(--gpt-bg-body);
    border: 1px solid var(--gpt-border-default);
    border-radius: 999px;
  }

  .tour-live-dot {
    width: 7px;
    height: 7px;
    background: rgb(var(--success-6));
    border-radius: 50%;
  }

  .tour-welcome-title {
    margin: 14px 0 10px;
    color: var(--gpt-text-primary);
    font-size: 22px;
    font-weight: 600;
  }

  .tour-welcome-intro {
    margin: 0;
    color: var(--gpt-text-secondary);
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-line;
  }

  .tour-welcome-footer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 20px;
  }
</style>

<style lang="less">
  .tour-welcome-modal {
    .arco-modal-body {
      padding: 20px 24px 24px;
    }
  }
</style>
