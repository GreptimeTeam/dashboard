<template lang="pug">
a-modal.query-modal(
  v-model:visible="queryModalVisible"
  :ok-text="$t('guide.confirm')"
  :hide-cancel="true"
  :width="384"
  :mask="false"
  :top="20"
  :align-center="false"
  :draggable="true"
  :render-to-body="false"
  :mask-style="{ 'pointer-events': 'none' }"
  @ok="handleOk"
)
  template(#title)
    div {{ $t('guide.welcome') }}
    svg.guide-banner
      use(href="#banner")

  template(#footer)
</template>

<script lang="ts" setup name="QueryModal">
  import { useAppStore } from '@/store'

  const { queryModalVisible } = storeToRefs(useAppStore())
  const { login } = useAppStore()

  const handleOk = async () => {}
</script>

<style lang="less" scoped></style>

<style lang="less">
  .query-modal {
    pointer-events: none;
    .arco-modal-wrapper {
      .arco-modal {
        pointer-events: auto;
      }
    }
  }
</style>
