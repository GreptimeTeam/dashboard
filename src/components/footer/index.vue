<template lang="pug">
a-layout-footer.footer
  a-space(:size="20")
    img.logo(:src="getIconUrl(`${role === 'cloud' ? 'cloud' : 'logo-text'}`)")
    a-space(:size="5")
      svg.service-icon
        use(href="#service")
      .service-name {{ serviceName || host }}
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
  import { getIconUrl } from '@/utils'
  import { useStorage } from '@vueuse/core'
  import useLocale from '@/hooks/locale'

  const { regionVendor, regionLocation, regionCountry, serviceName }: any = useStorage('config', {}).value
  const { host } = storeToRefs(useAppStore())
  const { role } = storeToRefs(useUserStore())
  const { statusRight } = storeToRefs(useStatusBarStore())

  const region = ref({
    vendor: regionVendor,
    location: regionLocation,
    country: regionCountry,
  })

  const vendorIcon = getIconUrl(region.value.vendor)

  const { currentLocale, onChangeLocale } = useLocale()

  // Not yet used in production
  const dev = import.meta.env.MODE === 'development'
</script>

<style lang="less" scoped>
  .footer {
    padding: 0 15px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--footer-height);

    text-align: center;
    font-size: 13px;
    .arco-link {
      display: flex;
    }
  }
  .logo {
    height: 18px;
  }
  .service-name {
    color: var(--main-font-color);
    font-weight: 600;
  }
  .service-icon {
    height: 18px;
    width: 18px;
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
