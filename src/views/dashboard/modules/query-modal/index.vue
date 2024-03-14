<template lang="pug">
a-modal.query-modal(
  v-model:visible="queryModalVisible"
  :class="{ 'full-screen': isFullscreen }"
  :ok-text="$t('guide.confirm')"
  :hide-cancel="true"
  :width="isFullscreen ? `calc(100vw - ${MENU_WIDTH}px - 32px)` : 636"
  :mask="false"
  :align-center="false"
  :mask-style="{ 'pointer-events': 'none' }"
  :footer="false"
  :draggable="true"
  @open="afterOpenModal"
)
  template(#title)
    | {{ $t('menu.dashboard.query') }}
    a-space(fill :size="3")
      a-tooltip(mini :content="$t('dashboard.clearCode')")
        a-button.screen-button(type="text" size="small" @click="clearCode")
          template(#icon)
            svg.icon-16
              use(href="#clear")
      a-button.screen-button(type="text" size="small" @click="isFullscreen = !isFullscreen")
        template(#icon)
          svg.icon-16(v-if="isFullscreen")
            use(href="#zoom-out")
          svg.icon-16(v-else)
            use(href="#zoom")
  a-space.editor-space(align="start" fill :size="0")
    a-scrollbar(:style="{ height: `calc(100vh - ${MODAL_TO_TOP * 2 + HEADER_HEIGHT}px)`, overflow: 'auto' }")
      Editor
      DataView.modal-view(v-if="!!results?.length" :results="results" :types="types")
</template>

<script lang="ts" setup name="QueryModal">
  import { useAppStore } from '@/store'
  import { listenerRouteChange } from '@/utils/route-listener'

  const { queryModalVisible } = storeToRefs(useAppStore())
  const { login, updateSettings } = useAppStore()
  const { getResultsByType, sqlView, promqlView, queryType, clearCode } = useQueryCode()

  const HEADER_HEIGHT = 60
  const MODAL_TO_TOP = 16
  const MENU_WIDTH = 80
  const isFullscreen = ref(false)
  const isLeft = ref(false)

  const types = ['sql', 'promql']

  const results = computed(() => getResultsByType(types))

  const afterOpenModal = () => {
    if (queryType.value === 'sql') {
      sqlView.value.focus()
    } else {
      promqlView.value.focus()
    }
  }

  // TODO: close or shrink the modal
  listenerRouteChange(() => {
    isFullscreen.value = false
  })
</script>

<style lang="less" scoped>
  .button-space {
    width: 25px;
    height: 25px;
  }

  .screen-button {
    font-size: 20px;
    color: var(--small-font-color);
  }
</style>

<style lang="less">
  .query-modal {
    pointer-events: none;
    .arco-modal-wrapper {
      overflow: hidden;
      .arco-modal {
        pointer-events: auto;
        box-shadow: 0 2px 10px 0 var(--box-shadow-color);
        .arco-modal-header {
          height: 60px;
          .arco-modal-title {
            font-weight: 800;
            font-size: 15px;
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
          height: 28px;
          width: 28px;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          margin-left: 3px;
          svg {
            stroke-width: 3px;
          }
        }
        .arco-modal-close-btn:hover {
          background: var(--th-bg-color);
          color: var(--brand-color);
        }
      }
    }

    .arco-modal-wrapper:not(.arco-modal-wrapper-moved) {
      .arco-modal {
        position: absolute;
        right: 0;
        top: 32px;
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

    &.full-screen {
      .arco-modal {
        transform: none !important;
        position: fixed !important;
        right: 16px !important;
        top: 16px !important;
      }
    }

    .editor-space {
      > .arco-space-item {
        width: 100%;
        > .arco-scrollbar {
          width: 100%;
          > .arco-scrollbar-track-direction-vertical {
            padding-left: 15px;
          }
        }
      }
    }

    .modal-view {
      padding-top: 12px;
      > .arco-tabs-content {
        > .arco-tabs-content-list > .arco-tabs-content-item {
          padding: 0;
          .arco-tabs-nav-ink {
            background: transparent;
          }
          .arco-tabs-nav-tab-list > :nth-child(2) {
            .arco-tabs-tab-title {
              border-left: 1px solid var(--border-color);
            }
          }
          .arco-tabs-tab {
            padding: 6px 0;
            margin: 15px 0 0 0;
            background: var(--th-bg-color);
            color: var(--main-font-color);

            &:first-of-type {
              border-top-left-radius: 4px;
              border-bottom-left-radius: 4px;
            }
            &:nth-last-of-type(2) {
              border-top-right-radius: 4px;
              border-bottom-right-radius: 3px;
            }

            &.arco-tabs-tab-active {
              color: var(--brand-color);
              font-weight: 800;
              letter-spacing: -0.5px;
            }
            > .arco-tabs-tab-title {
              width: 84px;
              padding-left: 10px;
              display: flex;
              font-size: 13px;
              height: 20px;
              align-items: center;

              &::before {
                border-radius: 4px;
                left: 0;
                right: 0;
                top: -6px;
                bottom: -6px;
              }
            }
          }
        }
      }
      > .arco-tabs-nav-type-rounded {
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 15px;
        .arco-icon-hover:hover::before {
          width: 20px;
          background-color: var(--card-bg-color);
        }
        > .arco-tabs-nav-tab {
          > .arco-tabs-nav-tab-list {
            > .arco-tabs-tab:not(:last-of-type) {
              margin-right: 10px;
            }
            > .arco-tabs-tab {
              background-color: var(--th-bg-color);
              border-radius: 4px;
              padding: 8px 10px;
              font-size: 13px;
              line-height: 16px;
            }
          }
        }
      }
    }
  }
</style>
