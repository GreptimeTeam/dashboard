<template lang="pug">
a-trigger(
  position="bottom"
  auto-fit-position
  trigger="click"
  :unmount-on-close="false"
)
  a-button(type="text" size="small") {{ $t('logsQuery.savedSql') }}
  template(#content)
    a-card(title="Saved SQL" style="width: 700px")
      a-list(:max-height="600")
        a-list-item(v-for="(item, index) in queryList" style="overflow-x: auto; padding: 5px 10px")
          pre
            | {{ item }}
          a-space
            a-button(size="mini" @click="() => useSql(item)") Use
            a-button(type="text" size="mini" @click="() => removeSql(index)") Remove
</template>

<script setup name="SavedQuery" type="ts">
  import useLogsQueryStore from '@/store/modules/logs-query'
  import { useStorage } from '@vueuse/core'

  const queryList = useStorage('log-query-list', [])
  const { editingSql, editorType } = storeToRefs(useLogsQueryStore())
  function useSql(sqlStr) {
    editingSql.value = sqlStr
    editorType.value = 'text'
  }

  function removeSql(index) {
    queryList.value.splice(index, 1)
  }
</script>

<style scoped lang="less"></style>
