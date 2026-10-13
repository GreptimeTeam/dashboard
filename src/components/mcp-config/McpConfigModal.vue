<template lang="pug">
a-modal(
  v-model:visible="visible"
  unmount-on-close
  :title="$t('settings.mcp.title')"
  :width="560"
  :footer="false"
)
  .mcp-docs
    .mcp-docs__head
      span.mcp-docs__desc {{ descText }}
      TextCopyable(
        size="mini"
        :data="serversJson"
        :show-data="false"
        :copy-tooltip="$t('settings.mcp.copy')"
        :copied-tooltip="$t('settings.mcp.copied')"
      )
    pre.mcp-docs__pre {{ serversJson }}
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
    resolveMcpConnectionInput,
  } from '@/utils/mcp-config'
  import useMcpConfig from './use-mcp-config'

  const { t } = useI18n()
  const { visible } = useMcpConfig()
  const { host, database, username, password, userTimezone } = storeToRefs(useAppStore())
  const repoUrl = MCP_SERVER_REPO_URL

  const useDemoAccount = computed(() => isQueryGuideEnabled())
  const descText = computed(() => (useDemoAccount.value ? t('settings.mcp.descDemo') : t('settings.mcp.desc')))

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
      max-height: 360px;
      overflow: auto;
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
