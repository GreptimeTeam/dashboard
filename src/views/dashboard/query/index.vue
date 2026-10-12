<template lang="pug">
a-layout.new-layout.new-layout--workspace(:class="{ 'query-layout--focus': focusMode }")
  a-resize-box(
    v-model:width="sidebarWidth"
    :class="{ 'hide-sider': focusMode }"
    :directions="['right']"
    :style="{ 'min-width': '100px', 'max-width': '40vw' }"
  )
    a-layout-sider(style="height: 100%" :width="actualSidebarWidth")
      TableManager(:databaseList="databaseList")
  a-layout-content.layout-content.has-panel
    a-space.layout-space(direction="vertical" fill :size="0")
      a-space.editor-space(
        align="start"
        fill
        direction="vertical"
        :size="0"
      ) 
        .editor-block(v-show="!focusMode")
          Editor(:focus-mode="focusMode")
        .query-results-panel
          DataView(
            v-if="!!session.results.value?.length || session.explainResults.value.length > 0"
            :focus-mode="focusMode"
            @toggle-focus-mode="toggleFocusMode"
          )
          .data-view-placeholder(v-else)
            a-empty(:description="$t('dashboard.queryResultsEmpty')")
              template(#image)
                svg.icon-32.query-results-empty-icon
                  use(href="#tableview")
      a-resize-box.panel-resize.logs-panel-resize(
        v-model:height="logsHeight"
        v-show="!focusMode"
        :directions="['top']"
        :style="{ 'max-height': '40vh', 'min-height': '66px' }"
      )
        a-tabs.panel-tabs
          a-tab-pane(title="Log" key="log")
            LogsNew(:logs="session.queryLogs.value")
</template>

<script lang="ts" setup name="query">
  import { useMagicKeys, useActiveElement, useStorage } from '@vueuse/core'
  import { useQueryFocusMode } from '@/composables/use-query-focus-mode'
  import { decodeMaybeEncoded } from '@/utils/query-url'
  import { provideQuerySession } from './use-query-session'

  defineOptions({
    name: 'Query',
  })

  const { s, q, escape } = useMagicKeys()
  const activeElement = useActiveElement()
  const appStore = useAppStore()
  const { databaseList, database } = storeToRefs(useAppStore())
  const route = useRoute()
  const originalDatabase = ref<string | undefined>(undefined)
  const { queryType, codes, runQuery, inputFromNewLineToQueryCode, sqlView } = useQueryCode()
  const session = provideQuerySession()
  const logsHeight = ref(66)
  const focusMode = useQueryFocusMode()

  const sidebarWidth = useStorage('sidebarWidth', 228)

  /**
   * Deep-link / product tour: append `?sql=` into the editor (do not replace),
   * then run only the appended statement and show results in the session panel.
   */
  let lastAppliedSqlParam: string | null = null

  function appendSqlToEditor(sql: string) {
    queryType.value = 'sql'
    const trimmed = sql.trim()

    if (sqlView.value) {
      inputFromNewLineToQueryCode(trimmed, 0)
      return
    }

    // Editor not mounted yet — seed `codes` so CodeMirror picks it up via v-model.
    const existing = (codes.value.sql || '').trimEnd()
    codes.value.sql = existing ? `${existing}\n${trimmed}` : trimmed
  }

  async function appendAndRunSql(sql: string) {
    const trimmed = sql.trim()
    if (!trimmed) return

    appendSqlToEditor(trimmed)

    const res = await runQuery(trimmed, 'sql', false, {} as never, 'run-part')
    if ((res as { cancelled?: boolean })?.cancelled) return
    if (res?.results?.length) session.appendResults(res.results)
    if (res?.log) session.appendLog(res.log)
  }

  watch(
    () => route.query.sql,
    (raw) => {
      if (typeof raw !== 'string' || !raw) return
      if (raw === lastAppliedSqlParam) return
      const sql = decodeMaybeEncoded(raw)
      if (!sql.trim()) return
      lastAppliedSqlParam = raw
      appendAndRunSql(sql).catch(() => undefined)
    },
    { immediate: true }
  )

  watch(sidebarWidth, (newWidth) => {
    if (newWidth < 100) {
      sidebarWidth.value = 100
    }
  })

  const actualSidebarWidth = computed(() => {
    const minWidth = 180
    const maxWidth = window.innerWidth * 0.4
    return Math.max(minWidth, Math.min(sidebarWidth.value, maxWidth))
  })

  const toggleFocusMode = () => {
    focusMode.value = !focusMode.value
  }

  const exitFocusMode = () => {
    focusMode.value = false
  }

  watch(s, (v) => {
    if (
      activeElement.value?.tagName !== 'INPUT' &&
      activeElement.value?.tagName !== 'TEXTAREA' &&
      !activeElement.value?.classList?.contains('cm-content')
    )
      queryType.value = 'sql'
  })
  watch(q, (v) => {
    if (
      activeElement.value?.tagName !== 'INPUT' &&
      activeElement.value?.tagName !== 'TEXTAREA' &&
      !activeElement.value?.classList?.contains('cm-content')
    )
      queryType.value = 'promql'
  })

  watch(escape, (v) => {
    if (v && focusMode.value) {
      exitFocusMode()
    }
  })
  watch([() => session.results.value.length, () => session.explainResults.value.length], ([resultLen, explainLen]) => {
    if (focusMode.value && resultLen + explainLen === 0) {
      exitFocusMode()
    }
  })

  onActivated(async () => {
    originalDatabase.value = database.value
    await appStore.refreshDatabaseList()
  })

  onDeactivated(() => {
    exitFocusMode()
    database.value = originalDatabase.value
    originalDatabase.value = undefined
  })

  onBeforeUnmount(() => {
    exitFocusMode()
  })
</script>

<style lang="less" scoped>
  :deep(.arco-layout-sider-light) {
    box-shadow: none !important;
  }
  .new-layout {
    :deep(> .arco-layout-content.layout-content.has-panel) {
      height: 100%;
    }
    :deep(.layout-space > .arco-space-item:first-of-type) {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding-left: 0;
    }
  }
  .new-layout.query-layout--focus {
    :deep(> .arco-layout-content.layout-content.has-panel) {
      width: 100%;
      max-width: 100%;
      overflow-x: hidden;
      box-sizing: border-box;
    }
    :deep(.layout-space > .arco-space-item:first-of-type) {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    :deep(.editor-space > .arco-space-item:first-of-type) {
      display: none !important;
    }
  }
  :deep(.layout-space) {
    height: 100%;
  }
  :deep(.editor-space) {
    padding-top: 0px;
    height: 100%;
    min-height: 0;
    > .arco-space-item {
      width: 100%;
      padding-right: 0;
      > .arco-scrollbar {
        width: 100%;
        > .arco-scrollbar-track-direction-vertical {
          padding-left: var(--gpt-page-padding-x);
        }
      }
      &:nth-of-type(2) {
        flex: 1;
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
    }
  }

  .editor-block {
    width: 100%;
  }

  :deep(.panel-resize) {
    background: var(--gpt-bg-panel);
  }

  .query-results-panel {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    flex-direction: column;

    :deep(.panel-tabs) {
      flex: 1;
      min-height: 0;
      height: 100%;
    }
  }

  .data-view-placeholder {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;

    :deep(.arco-empty) {
      padding: 0;
    }

    :deep(.arco-empty-image) {
      margin-bottom: 12px;
    }

    :deep(.arco-empty-description) {
      color: var(--gpt-text-secondary);
      font-size: var(--gpt-font-base);
    }

    .query-results-empty-icon {
      color: var(--gpt-text-secondary);
    }
  }
</style>
