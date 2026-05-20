<template lang="pug">
a-layout.status-page.new-layout
  a-layout-content.status-page-content
    a-spin(:loading="loading")
      a-card.status-build-card(v-if="displayRows.length" :bordered="true")
        template(#title)
          .status-card-title
            svg.icon-15.status-card-title-icon
              use(href="#cluster")
            span {{ t('status.buildInformation') }}
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
      icon: 'scripts',
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
    return STATUS_ROW_DEFS.map((def) => ({
      key: def.key,
      icon: def.icon,
      mono: def.mono,
      label: t(def.labelKey),
      value: pickStatusValue(data, def),
    }))
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

<style lang="less" scoped>
  .status-page {
    height: 100%;
    padding: var(--gpt-page-padding-y) var(--gpt-page-padding-x);
    background: var(--gpt-bg-app);
  }

  .status-page-content {
    display: flex;
    justify-content: center;
    padding: 0;
    background: transparent;
  }

  .status-build-card {
    width: 850px;
    max-width: 100%;
    border: 1px solid var(--gpt-border-default);
    border-radius: var(--gpt-radius-md);
    background: var(--gpt-bg-panel);
    box-shadow: 0 1px 4px rgba(71, 52, 96, 0.06);

    :deep(.arco-card-header) {
      min-height: 47px;
      padding: var(--gpt-toolbar-padding);
      background: var(--gpt-bg-header);
      border-bottom: 1px solid var(--gpt-border-default);
    }

    :deep(.arco-card-body) {
      padding: 0;
    }

    :deep(.arco-card-header-title) {
      flex: 1;
      min-width: 0;
    }

    :deep(.arco-card-header-extra) {
      flex-shrink: 0;
    }
  }

  .status-card-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--gpt-text-primary);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.3;
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
    gap: 16px;
    min-height: 44px;
    padding: 10px 16px;
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
    font-size: 12px;
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
    font-size: 12px;
    font-weight: 600;
    line-height: 1.5;
    word-break: break-all;

    &.is-mono {
      font-family: var(--font-mono);
      font-weight: 500;
    }
  }
</style>
