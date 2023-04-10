<template lang="pug">
a-tabs.result-tabs(type="rounded" lazy-load :active-key="activeTabKey" @tab-click="tabClick" @delete="deleteTab" editable :animation="true")
  template(#extra)
    a-button(@click="clearResults" status="danger") {{$t('dataExplorer.clear')}}
  a-tab-pane(v-for="(result, index) of results" :key="result.key" :title="`${$t('dataExplorer.result')} ${result.key - startKey + 1}`" closable) 
    a-space(direction="vertical" fill size="small")
      DataGrid(:data="result")
      DataChart(:data="result")
</template>

<script lang="ts" name="DataView" setup>
  import { useCodeRunStore } from '@/store'
  import type { ResultType } from '@/store/modules/code-run/types'

  const props = defineProps<{
    results: ResultType[]
    types: string[]
  }>()

  const { removeResult, clear } = useCodeRunStore()
  const activeTabKey = ref(props.results[0]?.key)
  const startKey = ref(props.results[0]?.key)

  const deleteTab = async (key: number) => {
    const index = props.results.findIndex((result) => result.key === key)
    if (props.results.length === 1) {
      startKey.value = props.results[0].key
    }
    await removeResult(key)
    if (activeTabKey.value === key) {
      activeTabKey.value = props.results[index]?.key || props.results[0].key
    }
  }

  const tabClick = (key: any) => {
    activeTabKey.value = key
  }

  const clearResults = () => {
    startKey.value = props.results[0].key
    clear(props.types)
  }
</script>
