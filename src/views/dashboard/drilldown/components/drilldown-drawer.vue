<template lang="pug">
a-drawer.drilldown-drawer(
  placement="right"
  width="100%"
  :class="variantClass"
  :popup-container="popupContainer"
  :visible="visible"
  :footer="false"
  :mask="false"
  :closable="closable"
  :esc-to-close="true"
  :unmount-on-close="true"
  @cancel="close"
  @update:visible="onVisible"
)
  template(#title)
    .drilldown-drawer__standard-header(v-if="variant !== 'logs'")
      .drilldown-drawer__title-text
        nav.drilldown-drawer__breadcrumb(:aria-label="t('drilldown.nav.breadcrumb')")
          a-breadcrumb
            a-breadcrumb-item(v-for="(item, index) in breadcrumbs" :key="`${index}-${item.label}`")
              button.drilldown-drawer__crumb-link(v-if="item.onSelect" type="button" @click="item.onSelect") {{ item.label }}
              span.drilldown-drawer__crumb-current(v-else :class="{ 'is-mono': item.mono }" :title="item.label") {{ item.label }}
        span.drilldown-drawer__title(v-if="title" :title="title") {{ title }}
        span.drilldown-drawer__subtitle(v-if="subtitle" :title="subtitle") {{ subtitle }}
        slot(name="title")
      .drilldown-drawer__actions
        slot(name="actions")

    .drilldown-drawer__logs-header(v-else)
      .drilldown-drawer__logs-main(
        :class="{ 'drilldown-drawer__logs-main--tall': !breadcrumbs.length && Boolean(title) }"
      )
        nav.drilldown-drawer__breadcrumb(:aria-label="t('drilldown.nav.breadcrumb')")
          a-breadcrumb
            a-breadcrumb-item(v-for="(item, index) in breadcrumbs" :key="`${index}-${item.label}`")
              button.drilldown-drawer__crumb-link(v-if="item.onSelect" type="button" @click="item.onSelect") {{ item.label }}
              span.drilldown-drawer__crumb-current(v-else :class="{ 'is-mono': item.mono }" :title="item.label") {{ item.label }}
        span.drilldown-drawer__title.drilldown-drawer__title--mono(v-if="title" :title="title") {{ title }}
        slot(name="title")
        button.drilldown-drawer__close(
          v-if="!closable"
          type="button"
          :aria-label="closeLabel"
          @click="close"
        )
          icon-close
      .drilldown-drawer__toolbar
        slot(name="toolbar")
      slot(name="tabs")

  slot
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { IconClose } from '@arco-design/web-vue/es/icon'
  import { useI18n } from 'vue-i18n'

  export interface DrilldownDrawerCrumb {
    label: string
    onSelect?: () => void
    mono?: boolean
  }

  const props = withDefaults(
    defineProps<{
      visible: boolean
      popupContainer: string
      variant?: 'standard' | 'logs' | 'stacked'
      closable?: boolean
      breadcrumbs?: DrilldownDrawerCrumb[]
      title?: string
      subtitle?: string
    }>(),
    {
      variant: 'standard',
      closable: true,
      breadcrumbs: () => [],
      title: undefined,
      subtitle: undefined,
    }
  )

  const emit = defineEmits<{
    close: []
  }>()

  const { t } = useI18n()
  const closeLabel = t('common.close')
  const variantClass = computed(() => `drilldown-drawer--${props.variant}`)

  const close = () => {
    emit('close')
  }

  const onVisible = (visible: boolean) => {
    if (!visible) {
      close()
    }
  }
</script>
