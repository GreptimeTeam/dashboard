<template lang="pug">
a-tabs.result-tabs(type="rounded" lazy-load :active-key="activeTabKey" @tab-click="tabClick" @delete="deleteTab" editable :animation="true")
  template(#extra)
    a-button(@click="clearResults" status="danger") {{$t('dataExplorer.clear')}}
  a-tab-pane(v-for="(result, index) of results" :key="result.key" :title="`${$t('dataExplorer.result')} ${result.key}`" closable) 
    a-space(direction="vertical" fill size="small")
      DataGrid(:data="result")
      DataChart(:data="result")
</template>

<script lang="ts" name="DataView" setup>
  import { useCodeRunStore } from '@/store'
  import type { ResultType } from '@/store/modules/code-run/types'

  const props = defineProps<{
    results: ResultType[]
  }>()

  const { removeResult, clearResults } = useCodeRunStore()
  const activeTabKey = ref(props.results[0]?.key)

  const deleteTab = async (key: number) => {
    const index = props.results.findIndex((result) => result.key === key)
    await removeResult(key)
    if (activeTabKey.value === key) {
      activeTabKey.value = props.results[index]?.key || props.results[0].key
    }
  }

  const tabClick = (key: any) => {
    activeTabKey.value = key
  }

  watch(
    () => ({ ...props }),
    (value, old) => {
      if (value.results.length > old.results.length) {
        activeTabKey.value = props.results.slice(-1)[0].key
      }
    }
  )
</script>
