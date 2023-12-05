<template lang="pug">
a-modal.guide-modal(
  v-model:visible="isShow"
  :mask-closable="false"
  :ok-text="$t('playground.create')"
  :hide-cancel="true"
  :closable="false"
  @ok="create"
)
  template(#title) {{ $t('playground.refreshTitle') }}
  template(#footer)
  | {{ $t('playground.refreshNote') }}
</template>

<script lang="ts" setup name="RefreshPlaygroundModal">
  import { createPlayground } from '@/api/playground'
  import { useStorage } from '@vueuse/core'

  const appStore = useAppStore()
  const { lang } = storeToRefs(useUserStore())
  const props = defineProps({
    visible: {
      type: Boolean,
      default: false,
    },
  })
  const isShow = ref(false)

  const toggleModal = () => {
    isShow.value = !isShow.value
  }

  const create = () => {
    window.location.href = lang.value === 'en-US' ? `https://greptime.com/playground` : `https://greptime.cn/playground`
  }

  defineExpose({
    toggleModal,
  })
</script>
