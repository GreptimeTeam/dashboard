<template lang="pug">
a-layout-footer.footer
  a-space(:size="20")
    img.logo(:src="getIconUrl(`${role === 'cloud' ? 'cloud' : 'logo-text'}`)")
    a-space(:size="5")
      svg.service-icon
        use(href="#host")
      .service-name {{ serviceName || host }}
    a-space(:size="5")
      svg.service-icon
        use(href="#database")
      .database-name {{ database }}
    a-space.db-connection-status(:size="6")
      span.db-status-dot(:class="`is-${dbConnectionStatus}`")
      span.db-status-text(:class="`is-${dbConnectionStatus}`") {{ dbStatusLabel }}
    a-space.region(v-if="region?.vendor" :size="0")
      img.icon(:src="getIconUrl(region.vendor)")
      .text.uppercase {{ region.vendor }}
      img.icon(:src="getIconUrl(region.country)")
      .text {{ region.location }}
  .right
    a-space(:size="10")
      a-select(
        v-if="dev"
        v-model="currentLocale"
        size="mini"
        :style="{ width: '112px' }"
        @change="onChangeLocale"
      )
        a-option(value="en-US") English
        a-option(value="zh-CN") 中文
      StatusList(:items="statusRight")
</template>

<script lang="ts" setup>
  import { useI18n } from 'vue-i18n'
  import { getIconUrl } from '@/utils'
  import useLocale from '@/hooks/locale'
  import type { DbConnectionStatus } from '@/store/modules/app/types'

  const { t } = useI18n()
  const appStore = useAppStore()
  const { host, database, dbConnectionStatus, regionVendor, regionLocation, regionCountry, serviceName } =
    storeToRefs(appStore)
  const { role } = storeToRefs(useUserStore())
  const { statusRight } = storeToRefs(useStatusBarStore())

  const region = computed(() => ({
    vendor: regionVendor.value,
    location: regionLocation.value,
    country: regionCountry.value,
  }))

  const dbStatusLabelMap: Record<DbConnectionStatus, string> = {
    unknown: 'dashboard.dbConnecting',
    connecting: 'dashboard.dbConnecting',
    connected: 'dashboard.dbConnected',
    disconnected: 'dashboard.dbDisconnected',
  }

  const dbStatusLabel = computed(() => t(dbStatusLabelMap[dbConnectionStatus.value]))

  const { currentLocale, onChangeLocale } = useLocale()

  // Not yet used in production
  const dev = import.meta.env.MODE === 'development'

  onMounted(async () => {
    await appStore.ensureConnectionHost()
    await appStore.checkDbConnection()
  })

  watch([host, database], () => {
    appStore.checkDbConnection()
  })
</script>

<style lang="less" scoped>
  .footer {
    padding: 0 15px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--footer-height);
    background-color: rgb(240, 237, 248);
    border-top: 1px solid var(--gpt-border-subtle);
    text-align: center;
    font-size: 12px;
    .arco-link {
      display: flex;
    }
  }
  .logo {
    height: 18px;
  }
  .service-name,
  .database-name {
    color: var(--main-font-color);
    font-weight: 600;
  }
  .service-icon {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    color: var(--gpt-text-secondary);
    fill: currentColor;
  }
  .db-connection-status {
    align-items: center;
  }
  .db-status-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;

    &.is-connected {
      background: var(--gpt-accent-ts);
      box-shadow: 0 0 0 3px rgba(0, 187, 178, 0.28);
    }

    &.is-disconnected {
      background: var(--danger-color, #f53f3f);
      box-shadow: 0 0 0 3px rgba(245, 63, 63, 0.2);
    }

    &.is-connecting,
    &.is-unknown {
      background: var(--gpt-text-muted);
      box-shadow: 0 0 0 3px rgba(176, 168, 196, 0.25);
    }
  }
  .db-status-text {
    font-size: 12px;
    font-weight: 600;
    line-height: 1;

    &.is-connected {
      color: var(--gpt-accent-ts);
    }

    &.is-disconnected {
      color: var(--danger-color, #f53f3f);
    }

    &.is-connecting,
    &.is-unknown {
      color: var(--gpt-text-secondary);
    }
  }
  .region {
    .icon {
      height: 13px;
      width: auto;
      margin-right: 6px;
    }
    .text {
      margin-right: 10px;
      color: var(--small-font-color);
    }
  }
</style>
