<template lang="pug">
a-layout-footer.footer
  a-space(:size="20")
    img.logo(:src="getIconUrl(`${role === 'cloud' ? 'cloud' : 'logo-text'}`)")
    a-space(:size="0")
      img.icon(:src="getIconUrl('service')")
      .service-name {{ serviceName || hostName }}
    a-space.region(v-if="region?.vendor" :size="0")
      img.icon(:src="getIconUrl(region.vendor)")
      .text {{ region.vendor.toUpperCase() }}
      img.icon(:src="getIconUrl(region.country)")
      .text {{ region.location }}
</template>

<script lang="ts" setup>
  import { getIconUrl } from '@/utils'
  import { useStorage } from '@vueuse/core'

  const { regionVendor, regionLocation, regionCountry, serviceName }: any = useStorage('config', {}).value
  const { host } = storeToRefs(useAppStore())
  const { role } = storeToRefs(useUserStore())
  const region = ref({
    vendor: regionVendor,
    location: regionLocation,
    country: regionCountry,
  })

  const hostName = computed(() => host.value.split('//')[1].split(':')[0])
  const vendorIcon = getIconUrl(region.value.vendor)
</script>

<style lang="less" scoped>
  .footer {
    padding-left: 15px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 26px;
    color: var(--color-text-2);
    text-align: center;
    font-size: 11px;
  }
  .logo {
    height: 18px;
  }
  .service-name {
    font-weight: 800;
  }

  .icon {
    height: 12px;
    width: auto;
    margin-right: 5px;
  }
  .text {
    margin-right: 9px;
  }
</style>
