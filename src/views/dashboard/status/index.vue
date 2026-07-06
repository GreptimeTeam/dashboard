<template lang="pug">
.query-layout.query-layout--surface.status-page.query-container
  .page-header.gpt-page-header.status-page-header
    .page-header-main
      | {{ $t('menu.dashboard.status') }}
      span.page-header-subtitle.gpt-text-page-subtitle
        | {{ $t('status.subtitle') }}
        a.status-page-learn-more(
          href="https://docs.greptime.com/user-guide/deployments-administration/monitoring/check-db-status/"
          target="_blank"
          rel="noopener noreferrer"
        )
          | Learn more
          svg.icon-12
            use(href="#import")
  .content-wrapper.query-layout-cards
    .status-content-center
      a-spin(:loading="loading")
        a-card.status-build-card.gpt-surface-card(v-if="displayRows.length" :bordered="false")
          template(#title)
            .status-card-title
              svg.icon-15.status-card-title-icon
                use(href="#cluster")
              span.gpt-surface-card__title {{ t('status.buildInformation') }}
          template(#extra)
            a-space(:size="8")
              a-button(
                type="text"
                size="small"
                :loading="loading"
                @click="refreshStatus"
              )
                template(#icon)
                  svg.icon-16
                    use(href="#refresh")
                | {{ t('common.refresh') }}
              TextCopyable(copyTooltip="Copy to Clipboard" :data="statusJson" :showData="false")
          .status-info-list
            .status-info-row(v-for="row in displayRows" :key="row.key")
              .status-info-label
                svg.icon-15.status-info-icon
                  use(:href="`#${row.icon}`")
                span {{ row.label }}
              .status-info-value(:class="{ 'is-mono': row.mono }") {{ row.value }}
        EmptyStatus(v-else :data="t('status.unsupported')")
</template>

<script lang="ts" setup name="Status">
  import { useI18n } from 'vue-i18n'
  import { getStatus } from '@/api/status'
  import { formatGreptimeVersion } from '@/composables/use-greptime-version'

  type StatusRecord = Record<string, unknown>

  type StatusRowDef = {
    key: string
    labelKey: string
    icon: string
    mono?: boolean
    aliases?: string[]
  }

  const STATUS_ROW_DEFS: StatusRowDef[] = [
    { key: 'version', labelKey: 'status.version', icon: 'tool' },
    { key: 'commit', labelKey: 'status.commit', icon: 'code', mono: true },
    { key: 'branch', labelKey: 'status.branch', icon: 'derive14' },
    {
      key: 'rustc_version',
      labelKey: 'status.rustVersion',
      icon: 'rust',
      mono: true,
      aliases: ['rust_version', 'rustc'],
    },
    { key: 'hostname', labelKey: 'status.hostname', icon: 'host' },
  ]

  const { t } = useI18n()
  const loading = ref(false)
  const statusData = ref<StatusRecord | null>(null)

  const pickStatusValue = (data: StatusRecord, def: StatusRowDef): string => {
    const keys = [def.key, ...(def.aliases ?? [])]
    const matchedKey = keys
      .map((key) => Object.keys(data).find((k) => k.toLowerCase() === key.toLowerCase()))
      .find((key) => {
        if (key === undefined) return false
        const raw = data[key]
        if (raw === null || raw === undefined) return false
        return String(raw).trim().length > 0
      })

    if (matchedKey === undefined) return '—'
    return String(data[matchedKey]).trim()
  }

  const statusJson = computed(() => JSON.stringify(statusData.value, null, 2))

  const displayRows = computed(() => {
    const data = statusData.value
    if (!data) return []
    return STATUS_ROW_DEFS.map((def) => {
      const rawValue = pickStatusValue(data, def)
      return {
        key: def.key,
        icon: def.icon,
        mono: def.mono,
        label: t(def.labelKey),
        value: def.key === 'version' ? formatGreptimeVersion(rawValue) : rawValue,
      }
    })
  })

  const refreshStatus = async () => {
    loading.value = true
    try {
      const res = await getStatus()
      statusData.value = res && typeof res === 'object' ? (res as StatusRecord) : null
    } catch {
      statusData.value = null
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    refreshStatus()
  })
</script>

<style lang="less">
  @import '@/assets/style/query-layout.less';
</style>

<style lang="less" scoped>
  .status-page {
    height: auto;
    min-height: 100%;
    overflow: visible;
    background: var(--gpt-bg-app);

    &.query-container {
      height: auto;
      min-height: calc(100vh - var(--footer-height));
      overflow: visible;
    }

    .content-wrapper {
      flex: 0 0 auto;
      align-items: center;
      width: 100%;
      overflow: visible;
    }
  }

  .status-content-center {
    flex-shrink: 0;
    width: 850px;
    max-width: 100%;
    margin-inline: auto;

    :deep(.arco-spin) {
      display: block;
      width: 100%;
    }
  }

  .status-page-header {
    flex-shrink: 0;
    justify-content: space-between;
    gap: var(--gpt-gap-lg);
  }

  .page-header-main {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .status-page-learn-more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 8px;
    font-weight: 500;
  }

  .status-build-card {
    width: 850px;
    max-width: 100%;
  }

  .status-card-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-card-title-icon {
    flex-shrink: 0;
    color: var(--gpt-text-secondary);
    fill: currentColor;
  }

  .status-info-list {
    display: flex;
    flex-direction: column;
  }

  .status-info-row {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    align-items: center;
    gap: var(--gpt-gap-xl);
    min-height: 44px;
    padding: var(--gpt-gap-lg) var(--gpt-page-padding-x);
    border-bottom: 1px solid var(--gpt-border-default);

    &:last-child {
      border-bottom: none;
    }
  }

  .status-info-label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: var(--gpt-text-secondary);
    font-size: var(--gpt-font-base);
    font-weight: 500;
    line-height: 1.4;
  }

  .status-info-icon {
    flex-shrink: 0;
    color: var(--gpt-text-secondary);
    fill: currentColor;
  }

  .status-info-value {
    min-width: 0;
    color: var(--gpt-text-primary);
    font-size: var(--gpt-font-base);
    font-weight: 600;
    line-height: 1.5;
    word-break: break-all;

    &.is-mono {
      font-family: var(--font-mono);
      font-weight: 500;
    }
  }
</style>
