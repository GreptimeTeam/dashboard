<template lang="pug">
a-modal.query-modal(
  v-model:visible="queryModalVisible"
  :class="{ 'full-screen': isFullscreen }"
  :ok-text="$t('guide.confirm')"
  :hide-cancel="true"
  :width="isFullscreen ? 'calc(100vw - 200px)' : 800"
  :mask="false"
  :align-center="false"
  :render-to-body="false"
  :mask-style="{ 'pointer-events': 'none' }"
  :footer="false"
  :draggable="true"
)
  template(#title)
    | {{ $t('menu.dashboard.query') }}
    a-button(@click="isFullscreen = !isFullscreen")
      icon-fullscreen(v-if="!isFullscreen")
      icon-fullscreen-exit(v-else)
  a-scrollbar(style="height: calc(100vh - 56px); overflow: auto")
    Editor
    DataView(v-if="!!results?.length" :results="results" :types="types")
</template>

<script lang="ts" setup name="QueryModal">
  import { useAppStore } from '@/store'

  const { queryModalVisible } = storeToRefs(useAppStore())
  const { login } = useAppStore()
  const { getResultsByType } = useQueryCode()

  const HEADER_HEIGHT = 36
  const MODAL_TO_TOP = 20
  const isFullscreen = ref(false)

  const handleOk = async () => {}
  const types = ['sql', 'promql']

  const results = computed(() => getResultsByType(types))
</script>

<style lang="less" scoped></style>

<style lang="less">
  .query-modal {
    &.full-screen {
      .arco-modal {
        transform: none !important;
        position: fixed;
        right: 0;
        top: 20px;
      }
    }
    pointer-events: none;
    .arco-modal-wrapper {
      overflow: hidden;
      .arco-modal {
        pointer-events: auto;
        box-shadow: 0 2px 10px 0 var(--box-shadow-color);
        .arco-modal-header {
          height: 36px;
          .arco-modal-title {
            padding-right: 20px;
            justify-content: space-between;
          }
        }
        .arco-modal-body {
          padding: 0 12px;
        }
        .arco-modal-close-btn {
          font-size: 20px;
        }
      }
    }
    .arco-modal-wrapper:not(.arco-modal-wrapper-moved) {
      .arco-modal {
        position: absolute;
        right: 0;
        top: 20px;
      }
    }
  }
</style>
