<template lang="pug">
a-modal.news-modal(
  v-model:visible="visible"
  width="800px"
  :title="$t('menu.news')"
  :footer="false"
  :closable="true"
  :mask-closable="true"
  @cancel="handleCancel"
)
  .news-content
    .news-container
      a-list(
        size="small"
        :data="newsList"
        :bordered="false"
        :loading="loading"
      )
        template(#item="{ item, index }")
          a-list-item.news-item(:key="index" @click="openNewsLink(item.link)")
            template(#actions)
              .news-date(v-if="item.date")
                icon-clock-circle
                span {{ item.date }}
            a-list-item-meta.news-meta
              template(#title)
                .news-title-wrapper
                  span.news-title {{ item.title }}
              template(#description)
                .news-description(v-if="item.description") {{ item.description }}
        template(#empty)
          EmptyStatus(:data="'No news available'")
      .see-all-news(@click="openAllNewsLink")
        .see-all-content
          icon-apps
          span {{ $t('news.seeAll') }}
          icon-arrow-right.arrow-icon
</template>

<script lang="ts">
  import { type NewsItem } from '@/api/news'

  export default {
    name: 'NewsModal',
  }
</script>

<script lang="ts" setup>
  type Props = {
    newsList: NewsItem[]
    loading?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    newsList: () => [],
    loading: false,
  })

  const visible = ref(false)

  const show = () => {
    visible.value = true
  }

  const handleCancel = () => {
    visible.value = false
  }

  const openNewsLink = (link: string) => {
    window.open(link, '_blank')
  }

  const openAllNewsLink = () => {
    window.open('https://greptime.com/blogs/', '_blank')
  }

  defineExpose({
    show,
  })
</script>

<style scoped lang="less">
  .news-content {
    max-height: 520px;
    overflow-y: auto;
  }

  .news-container {
    :deep(.arco-list) {
      .arco-list-item {
        padding: 8px 24px;
        border-bottom: none;

        &:not(:last-child) {
          border-bottom: 1px solid var(--border-color);
        }
      }
    }
  }

  .news-item {
    padding: 20px 24px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: linear-gradient(
        90deg,
        rgba(var(--primary-6-rgb), 0.02) 0%,
        rgba(var(--primary-6-rgb), 0.05) 50%,
        rgba(var(--primary-6-rgb), 0.02) 100%
      );
      transform: translateX(2px);
    }

    &:active {
      transform: translateX(0);
    }

    :deep(.arco-list-item-meta) {
      align-items: flex-start;
    }

    :deep(.arco-list-item-meta-content) {
      flex: 1;
    }

    :deep(.arco-list-item-action) {
      margin-left: 16px;
      align-self: flex-start;
      margin-top: 2px;
    }
  }

  .news-title-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s ease;
    padding: 2px 0;
  }

  .news-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--main-font-color);
    line-height: 1.5;
    margin: 0;
    flex: 1;
    transition: color 0.2s ease;
  }

  .news-item:hover .news-title {
    color: var(--primary-color);
  }

  .news-description {
    font-size: 13px;
    color: var(--small-font-color);
    line-height: 1.6;
    margin: 8px 0 0 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .news-date {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--small-font-color);
    white-space: nowrap;

    svg {
      font-size: 12px;
    }
  }

  .see-all-news {
    margin: 8px 24px 16px;
    padding: 16px 20px;
    background: linear-gradient(135deg, rgba(var(--primary-6-rgb), 0.08) 0%, rgba(var(--primary-6-rgb), 0.12) 100%);
    border: 1px solid rgba(var(--primary-6-rgb), 0.2);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
      background: linear-gradient(135deg, rgba(var(--primary-6-rgb), 0.12) 0%, rgba(var(--primary-6-rgb), 0.18) 100%);
      border-color: rgba(var(--primary-6-rgb), 0.3);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(var(--primary-6-rgb), 0.15);

      .arrow-icon {
        transform: translateX(4px);
      }
    }

    &:active {
      transform: translateY(0);
    }
  }

  .see-all-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--primary-color);

    svg {
      font-size: 16px;
    }

    .arrow-icon {
      transition: transform 0.2s ease;
      margin-left: 4px;
    }
  }
</style>

<style lang="less">
  .news-modal {
    .arco-modal-header {
      border-bottom: 1px solid var(--border-color);
      padding: 20px 24px 16px;
      font-family: 'Gilroy';
      height: auto;

      .arco-modal-title {
        font-size: 18px;
        font-weight: 600;
      }
    }

    .arco-modal-body {
      padding: 0;
    }
  }
</style>
