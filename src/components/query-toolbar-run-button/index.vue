<template lang="pug">
a-tooltip(mini :content="t('common.stop')" :disabled="!showStop")
  a-button(:type="buttonType" :class="buttonClass" @click="handleButtonClick")
    .query-run-btn__row
      a-space.query-run-btn__content(:size="4")
        span.query-run-btn__icon
          icon-loading(v-if="running" spin)
          slot(v-else name="icon")
        .query-run-btn__label
          slot
      span.query-run-btn__icon.query-run-btn__icon--trailing.query-run-btn__stop(
        v-if="showStop"
        role="button"
        tabindex="-1"
        @mousedown.stop.prevent
        @click.stop.prevent="cancel"
      )
        icon-record-stop.stop-icon
</template>

<script lang="ts" setup>
  import { useI18n } from 'vue-i18n'
  import { useDelayedVisible } from '@/composables/use-delayed-visible'
  import { cancelRunCode, type RunCodeAbortKey } from '@/services/code-run'

  const props = withDefaults(
    defineProps<{
      abortKey: RunCodeAbortKey
      onRun: () => Promise<void>
      buttonType?: 'primary' | 'outline' | 'dashed' | 'text'
      buttonClass?: string
    }>(),
    {
      buttonType: 'outline',
      buttonClass: '',
    }
  )

  const { t } = useI18n()
  const running = ref(false)
  const showStop = useDelayedVisible(running)

  const isStopTarget = (event: MouseEvent) => Boolean((event.target as HTMLElement).closest('.query-run-btn__stop'))

  const cancel = () => {
    if (!running.value) return
    cancelRunCode(props.abortKey)
    running.value = false
  }

  const startRun = async () => {
    if (running.value) return
    running.value = true
    try {
      await props.onRun()
    } finally {
      running.value = false
    }
  }

  const handleButtonClick = async (event: MouseEvent) => {
    if (isStopTarget(event)) return
    await startRun()
  }

  defineExpose({ run: startRun, running })
</script>

<style lang="less" scoped>
  .query-run-btn__row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .query-run-btn__content {
    flex-wrap: nowrap;
  }

  .query-run-btn__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .query-run-btn__icon--trailing {
    width: 20px;
    min-width: 20px;
    height: 20px;
  }

  .query-run-btn__stop {
    position: relative;
    z-index: 1;
    cursor: pointer;
    pointer-events: auto;

    .stop-icon {
      font-size: 18px;
      flex-shrink: 0;
      color: var(--danger-color);
      pointer-events: none;
    }
  }

  .query-run-btn--primary {
    :deep(.arco-btn) {
      display: inline-flex;
      align-items: center;
    }

    .query-run-btn__icon :deep(.arco-icon) {
      color: var(--gpt-text-inverse);
    }

    .query-run-btn__stop .stop-icon {
      color: var(--gpt-text-inverse);
      font-size: 18px;
    }
  }

  .query-run-btn--outline {
    :deep(.arco-btn) {
      display: inline-flex;
      align-items: center;
    }
  }
</style>
