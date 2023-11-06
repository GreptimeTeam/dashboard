<template lang="pug">
a-modal.query-modal(
  v-model:visible="queryModalVisible"
  :class="{ 'full-screen': isFullscreen, left: isLeft, right: !isLeft }"
  :ok-text="$t('guide.confirm')"
  :hide-cancel="true"
  :width="isFullscreen ? 'calc(100vw - 200px)' : 800"
  :mask="false"
  :align-center="false"
  :mask-style="{ 'pointer-events': 'none' }"
  :footer="false"
  @open="afterOpenModal"
)
  template(#title)
    | {{ $t('menu.dashboard.query') }}
    a-button(@click="isFullscreen = !isFullscreen")
      icon-fullscreen(v-if="!isFullscreen")
      icon-fullscreen-exit(v-else)
  a-space(align="start" :size="0")
    .button-space
      a-button(v-show="!isLeft" type="text" @click="moveToLeft")
        template(#icon)
          icon-to-left.icon-18
    a-scrollbar(style="height: calc(100vh - 56px); overflow: auto")
      Editor
      DataView(v-if="!!results?.length" :results="results" :types="types")
    .button-space
      a-button(v-show="isLeft" @click="moveToRight")
        template(#icon)
          icon-to-right.icon-18
</template>

<script lang="ts" setup name="QueryModal">
  import { useAppStore } from '@/store'

  const { queryModalVisible } = storeToRefs(useAppStore())
  const { login, updateSettings } = useAppStore()
  const { getResultsByType, sqlView, promqlView, queryType } = useQueryCode()

  const HEADER_HEIGHT = 36
  const MODAL_TO_TOP = 20
  const isFullscreen = ref(false)
  const isLeft = ref(false)

  const handleOk = async () => {}
  const types = ['sql', 'promql']

  const results = computed(() => getResultsByType(types))

  const afterOpenModal = () => {
    if (queryType.value === 'sql') {
      sqlView.value.focus()
    } else {
      promqlView.value.focus()
    }
  }

  const moveToLeft = () => {
    isLeft.value = true
  }

  const moveToRight = () => {
    isLeft.value = false
  }
</script>

<style lang="less" scoped>
  .arco-btn-size-medium.arco-btn-only-icon {
    width: 25px;
    height: 25px;
    margin-top: 50px;
  }
  .button-space {
    width: 25px;
    height: 25px;
  }
</style>

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
          padding: 0;
        }
        .arco-modal-close-btn {
          font-size: 20px;
        }
      }
    }

    &.left {
      .arco-modal-wrapper:not(.arco-modal-wrapper-moved) {
        .arco-modal {
          left: 258px;
        }
      }
    }

    &.right {
      .arco-modal-wrapper:not(.arco-modal-wrapper-moved) {
        .arco-modal {
          right: 0;
        }
      }
    }

    .arco-modal-wrapper:not(.arco-modal-wrapper-moved) {
      .arco-modal {
        position: absolute;
        top: 20px;
      }
    }
  }
</style>
