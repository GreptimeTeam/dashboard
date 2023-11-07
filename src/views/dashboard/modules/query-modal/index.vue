<template lang="pug">
a-modal.query-modal(
  v-model:visible="queryModalVisible"
  :class="{ 'full-screen': isFullscreen }"
  :ok-text="$t('guide.confirm')"
  :hide-cancel="true"
  :width="isFullscreen ? 'calc(100vw - 286px)' : 636"
  :mask="false"
  :align-center="false"
  :mask-style="{ 'pointer-events': 'none' }"
  :footer="false"
  :draggable="true"
  @open="afterOpenModal"
)
  template(#title)
    | {{ $t('menu.dashboard.query') }}
    a-space(fill :size="0")
      a-button.screen-button(type="text" @click="clearCode")
        template(#icon)
          svg.icon-18
            use(href="#clear")
      a-button.screen-button(type="text" @click="isFullscreen = !isFullscreen")
        template(#icon)
          svg.icon-16(v-if="!isFullscreen")
            use(href="#zoom")
          icon-fullscreen-exit(v-else)
  a-space.editor-space(align="start" fill :size="0")
    a-scrollbar(style="height: calc(100vh - 68px); overflow: auto")
      Editor
      DataView.modal-view(v-if="!!results?.length" :results="results" :types="types")
</template>

<script lang="ts" setup name="QueryModal">
  import { useAppStore } from '@/store'

  const { queryModalVisible } = storeToRefs(useAppStore())
  const { login, updateSettings } = useAppStore()
  const { getResultsByType, sqlView, promqlView, queryType, clearCode } = useQueryCode()

  const HEADER_HEIGHT = 48
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
</script>

<style lang="less" scoped>
  .arco-btn-size-medium.arco-btn-only-icon {
  }
  .button-space {
    width: 25px;
    height: 25px;
  }

  .screen-button {
    width: px;
    font-size: 20px;
    color: var(--small-font-color);
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
          height: 48px;
          .arco-modal-title {
            padding-right: 13px;
            font-weight: 800;
            justify-content: space-between;
          }
        }
        .arco-modal-body {
          padding: 0 20px;
        }
        .arco-modal-close-btn {
          font-size: 22px;
          color: var(--small-font-color);
          display: flex;
          svg {
            stroke-width: 3px;
          }
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

    .arco-modal-wrapper.arco-modal-wrapper-moved {
      .arco-modal {
        .ͼo {
          .cm-tooltip {
            left: 60px !important;
          }
        }
      }
    }

    .editor-space {
      > .arco-space-item {
        width: 100%;
        > .arco-scrollbar {
          width: 100%;
        }
      }
    }

    .modal-view {
      padding-top: 16px;
      > .arco-tabs-content {
        > .arco-tabs-content-list > .arco-tabs-content-item {
          padding: 0;
          .arco-tabs-nav-ink {
            background: transparent;
          }
          .arco-tabs-tab {
            padding: 4px 8px;
            margin: 10px 4px 0 0;
            background: var(--th-bg-color);
            border-radius: 4px;
            color: var(--main-font-color);
            height: 30px;
            &.arco-tabs-tab-active {
              color: var(--brand-color);
              font-weight: 800;
            }
            > .arco-tabs-title {
              display: flex;
            }
          }
        }
      }
      > .arco-tabs-nav-type-rounded {
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 10px;
        > .arco-tabs-nav-tab {
          > .arco-tabs-nav-tab-list {
            > .arco-tabs-tab:not(:last-of-type) {
              margin-right: 10px;
            }
            > .arco-tabs-tab {
              background-color: var(--th-bg-color);
              border-radius: 6px;
              padding: 10px 10px;
            }
          }
        }
      }
    }
  }
</style>
