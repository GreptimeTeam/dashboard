<template lang="pug">
a-modal.guide-modal(v-model:visible="isShow" :mask-closable="false" :ok-text="$t('playground.create')" :hide-cancel="true" :closable="false" @ok="create")
  template(#title)
    .
      {{ $t('playground.refeshTitle')
      }}
  template(#footer)
  | {{ $t('playground.refeshNote') }}
</template>

<script lang="ts" setup name="RefreshPlaygroundModal">
  import { createPlayground } from '@/api/playground'
  import { useStorage } from '@vueuse/core'

  const appStore = useAppStore()
  const props = defineProps({
    visible: {
      type: Boolean,
      default: false,
    },
  })
  const isShow = ref(false)
  const { VITE_RECAPTCHA_SITE_KEY } = import.meta.env

  const toggleModal = () => {
    isShow.value = !isShow.value
  }

  const create = () => {
    window.grecaptcha.ready(async () => {
      const token = await window.grecaptcha.execute(VITE_RECAPTCHA_SITE_KEY, { action: 'submit' })
      const data = (await createPlayground(token)) as any

      const params = btoa(
        JSON.stringify({
          username: data.username,
          password: data.password,
          database: `${data.teamId}-${data.serviceName}`,
          dbId: data.dbId,
        })
      )

      window.location.href = `https://${Object.values(data.domain)[0]}/dashboard/playground?info=${params}`
    })
  }

  defineExpose({
    toggleModal,
  })
</script>
