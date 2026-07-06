<template lang="pug">
.star-marketing-card
  .star-card-header
    .star-card-brand
      svg.icon-18.github-icon
        use(href="#github")
      .star-count
        svg.icon-14.star-icon
          use(href="#star")
        span {{ formattedStars }}
    a-button.star-card-close(type="text" @click="handleClose")
      icon-close
  .star-card-description {{ $t('menu.starBanner.description') }}
  a-button.star-card-button(type="outline" @click="openRepo")
    | {{ $t('menu.starBanner.button') }}
</template>

<script lang="ts" setup>
  import useGithubStars from '@/composables/use-github-stars'

  const emit = defineEmits<{
    close: []
  }>()

  const { formattedStars, repoUrl } = useGithubStars()

  const handleClose = () => {
    emit('close')
  }

  const openRepo = () => {
    window.open(repoUrl, '_blank')
  }
</script>

<style scoped lang="less">
  .star-marketing-card {
    padding: 12px;
    background: var(--card-bg-color);
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-sm);
  }

  .star-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .star-card-brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .github-icon {
    flex-shrink: 0;
    color: var(--main-font-color);
  }

  .star-count {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--main-font-color);
    font-size: 14px;
    font-weight: 600;
    line-height: 1;
  }

  .star-icon {
    flex-shrink: 0;
  }

  .star-card-close {
    min-width: 20px;
    height: 20px;
    padding: 0;
    color: var(--gpt-text-secondary);

    &:hover {
      color: var(--gpt-brand-900);
      background: transparent;
    }
  }

  .star-card-description {
    margin-bottom: 12px;
    color: var(--small-font-color);
    font-size: 12px;
    line-height: 1.5;
  }

  .star-card-button {
    display: flex;
    justify-content: center;
    width: 100%;
    height: 28px;
    padding: 0 12px;
    color: var(--primary-color);
    font-size: 12px;
    line-height: 1;
    border-color: var(--primary-color);
    border-radius: var(--gpt-radius-sm);

    &:hover {
      color: #fff;
      background: @color-primary-5;
      border-color: @color-primary-5;
    }
  }
</style>
