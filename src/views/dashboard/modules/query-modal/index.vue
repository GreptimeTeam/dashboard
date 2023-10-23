<template lang="pug">
a-modal.query-modal(
  v-model:visible="queryModalVisible"
  :ok-text="$t('guide.confirm')"
  :hide-cancel="true"
  :width="800"
  :mask="false"
  :top="MODAL_TO_TOP"
  :align-center="false"
  :render-to-body="false"
  :mask-style="{ 'pointer-events': 'none' }"
  :footer="false"
)
  template(#title)
    | {{ $t('menu.dashboard.query') }}
  a-scrollbar(style="height: calc(100vh - 66px); overflow: auto")
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

  const handleOk = async () => {}
  const types = ['sql', 'promql']

  const results = computed(() => getResultsByType(types))
</script>

<style lang="less" scoped></style>

<style lang="less">
  .query-modal {
    pointer-events: none;
    .arco-modal-wrapper {
      .arco-modal {
        position: absolute;
        right: 20px;
        pointer-events: auto;
        box-shadow: 0 2px 10px 0 var(--box-shadow-color);
        .arco-modal-header {
          height: 36px;
        }
        .arco-modal-body {
          padding: 0 12px;
        }
        .arco-modal-close-btn {
          font-size: 20px;
        }
      }
    }
  }
</style>
