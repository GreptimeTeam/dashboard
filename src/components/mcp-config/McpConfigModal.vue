<template lang="pug">
a-modal(
  unmount-on-close
  :visible="visible"
  :title="$t('settings.mcp.title')"
  :width="560"
  :footer="false"
  @cancel="close"
)
  .mcp-docs
    .mcp-docs__head
      span.mcp-docs__desc {{ $t('settings.mcp.copyHint') }}
      TextCopyable(
        size="mini"
        :data="promptText"
        :show-data="false"
        :copy-tooltip="$t('settings.mcp.copy')"
        :copied-tooltip="$t('settings.mcp.copied')"
      )
    pre.mcp-docs__pre {{ promptText }}
    a-link.mcp-docs__link(target="_blank" icon :href="repoUrl") {{ $t('settings.mcp.repo') }}
</template>

<script lang="ts" setup name="McpConfigModal">
  import { useI18n } from 'vue-i18n'
  import TextCopyable from '@/components/text-copyable.vue'
  import { useAppStore } from '@/store'
  import { isQueryGuideEnabled } from '@/utils/query-guide-enabled'
  import {
    MCP_SERVER_REPO_URL,
    buildMcpConnectionParams,
    buildMcpServersJson,
    buildMcpSetupPrompt,
    resolveMcpConnectionInput,
  } from '@/utils/mcp-config'
  import useMcpConfig from './use-mcp-config'

  const { t } = useI18n()
  const { visible, close } = useMcpConfig()
  const { host, database, username, password, userTimezone } = storeToRefs(useAppStore())
  const repoUrl = MCP_SERVER_REPO_URL

  const useDemoAccount = computed(() => isQueryGuideEnabled())

  const serversJson = computed(() =>
    buildMcpServersJson(
      buildMcpConnectionParams(
        resolveMcpConnectionInput(
          {
            host: host.value,
            database: database.value,
            username: username.value,
            password: password.value,
            timezone: userTimezone.value,
          },
          { useDemoAccount: useDemoAccount.value }
        )
      )
    )
  )

  const promptText = computed(() =>
    buildMcpSetupPrompt(serversJson.value, t('settings.mcp.promptIntro'), t('settings.mcp.promptOutro'))
  )
</script>

<style scoped lang="less">
  .mcp-docs {
    &__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }

    &__desc {
      font-size: 13px;
      line-height: 1.5;
      color: var(--color-text-2);
    }

    &__pre {
      margin: 0 0 12px;
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-all;
      background: var(--color-fill-2);
      border-radius: var(--gpt-radius-sm, 4px);
      color: var(--color-text-1);
    }

    &__link {
      font-size: 12px;
    }
  }
</style>
