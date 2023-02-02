<template>
  <div class="block">
    <h5 class="title">{{ title }}</h5>
    <div v-for="option in options" :key="option.name" class="switch-wrapper">
      <span>{{ $t(option.name) }}</span>
      <form-wrapper
        :type="option.type || 'switch'"
        :name="option.key"
        :default-value="option.defaultVal"
        :select-ops="option.selectOps"
        @input-change="handleChange"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { PropType } from 'vue'
  import { useAppStore } from '@/store'
  import FormWrapper from './form-wrapper.vue'

  interface OptionsProps {
    name: string
    key: string
    type?: string
    defaultVal?: any
    selectOps?: Array<any>
  }
  defineProps({
    title: {
      type: String,
      default: '',
    },
    options: {
      type: Array as PropType<OptionsProps[]>,
      default() {
        return []
      },
    },
  })
  const appStore = useAppStore()
  const handleChange = async ({ key, value }: { key: string; value: unknown }) => {
    if (key === 'colorWeak') {
      document.body.style.filter = value ? 'invert(80%)' : 'none'
    }
    if (key === 'menuFromServer' && value) {
      await appStore.fetchServerMenuConfig()
    }
    appStore.updateSettings({ [key]: value })
  }
</script>

<style scoped lang="less">
  .block {
    margin-bottom: 24px;
  }

  .title {
    margin: 10px 0;
    padding: 0;
    font-size: 14px;
  }

  .switch-wrapper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 32px;
  }

  span {
    margin-right: 10px;
  }
</style>
