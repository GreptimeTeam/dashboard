<template>
  <div v-if="!appStore.navbar" class="fixed-settings" @click="setVisible">
    <a-button type="primary">
      <template #icon>
        <icon-settings />
      </template>
    </a-button>
  </div>
  <a-drawer
    :width="300"
    unmount-on-close
    :visible="visible"
    :ok-text="$t('settings.save')"
    mask-closable
    @ok="cancel"
    @cancel="cancel"
  >
    <template #title> {{ $t('settings.title') }} </template>
    <Block :options="authOpts" :title="$t('settings.auth')" />
    <Block :options="databaseOpts" :title="$t('settings.database')" />
  </a-drawer>
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { Message } from '@arco-design/web-vue'
  import { useI18n } from 'vue-i18n'
  import { useClipboard } from '@vueuse/core'
  import { useAppStore } from '@/store'
  import axios from 'axios'
  import Block from './block.vue'

  const emit = defineEmits(['cancel'])

  const appStore = useAppStore()

  const { t } = useI18n()
  const { copy } = useClipboard()
  const visible = computed(() => appStore.globalSettings)
  const authOpts = computed(() => [
    { name: 'settings.username', key: 'principal', defaultVal: appStore.principal, type: 'input' },
    {
      name: 'settings.password',
      key: 'credential',
      defaultVal: appStore.credential,
      type: 'password',
    },
  ])
  const databaseOpts = computed(() => [
    {
      name: 'settings.databaseURL',
      key: 'databaseURL',
      defaultVal: appStore.databaseURL,
      type: 'input',
    },
    {
      name: 'settings.database',
      key: 'database',
      defaultVal: appStore.database,
      selectOps: appStore.databaseList,
      type: 'select',
    },
  ])

  const cancel = () => {
    appStore.updateSettings({ globalSettings: false })
    axios.defaults.baseURL = appStore.databaseURL
    emit('cancel')
  }
  const copySettings = async () => {
    const text = JSON.stringify(appStore.$state, null, 2)
    await copy(text)
    Message.success(t('settings.copySettings.message'))
  }
  const setVisible = () => {
    appStore.updateSettings({ globalSettings: true })
  }

  onMounted(() => {
    axios.defaults.baseURL = appStore.databaseURL
  })
</script>

<style scoped lang="less">
  .fixed-settings {
    position: fixed;
    top: 280px;
    right: 0;

    svg {
      font-size: 18px;
      vertical-align: -4px;
    }
  }
</style>
