<template lang="pug">
a-button(:loading="loading" @click="imp")
  slot
</template>

<script setup name="MarkdownImportButton" lang="ts">
  import { importPresets } from '@/api/playground'
  import i18n from '@/locale'
  import { Message } from '@arco-design/web-vue'

  // data
  const props = defineProps({
    from: {
      type: String,
      default: '',
    },
    table: {
      type: String,
      default: '',
    },
  })
  const appStore = useAppStore()
  const loading = ref(false)
  // methods
  const imp = async () => {
    try {
      loading.value = true
      const res: any = await importPresets(appStore.database, props.table, props.from)

      Message.success({
        content: i18n.global.t('playground.import', {
          lines: res.output[0].affectedrows,
          time: res.networkTime,
          duration: 5 * 1000,
        }),
      })
    } catch (error) {
      console.log(`error:`, error)
    }
    loading.value = false
  }
  // lifecycle
</script>

<style lang="stylus" rel="stylesheet/stylus" scoped></style>
