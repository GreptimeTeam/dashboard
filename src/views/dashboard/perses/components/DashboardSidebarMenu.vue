<template lang="pug">
a-dropdown.dashboard-sidebar-menu(
  trigger="click"
  position="right"
  popup-container="body"
  popup-class="dashboard-sidebar-menu-popup"
  @select="handleSelect"
)
  a-popconfirm(
    type="warning"
    position="left"
    :popup-visible="deleteConfirmVisible"
    :content="$t('dashboard.perses.deleteConfirmWithName', { name: dashboardName })"
    :ok-text="$t('guide.confirm')"
    :cancel-text="$t('common.cancel')"
    @popup-visible-change="handleDeleteConfirmVisibleChange"
    @ok="emit('delete')"
  )
    a-button.menu-button(type="text" :class="{ 'delete-confirm-open': deleteConfirmVisible }" @click.stop)
      template(#icon)
        svg.icon-14.rotate-90
          use(href="#extra")
  template(#content)
    a-doption(v-if="kind === 'live'" value="saveSnapshot" :disabled="!isSelected")
      | {{ $t('dashboard.perses.saveSnapshot') }}
    a-doption(v-if="kind === 'live'" value="exportSnapshotJson" :disabled="!isSelected")
      | {{ $t('dashboard.perses.exportSnapshot') }}
    a-doption(v-if="kind === 'snapshot'" value="exportSnapshotJson")
      | {{ $t('dashboard.perses.exportSnapshot') }}
    a-doption(value="delete")
      | {{ $t('dashboard.perses.menuDelete') }}
</template>

<script lang="ts" setup name="DashboardSidebarMenu">
  import { ref } from 'vue'
  import { useI18n } from 'vue-i18n'

  useI18n()

  const props = defineProps<{
    kind: 'live' | 'snapshot'
    isSelected: boolean
    dashboardName: string
  }>()

  const emit = defineEmits<{
    (e: 'saveSnapshot'): void
    (e: 'exportSnapshotJson'): void
    (e: 'delete'): void
  }>()

  type MenuAction = 'saveSnapshot' | 'exportSnapshotJson' | 'delete'
  const deleteConfirmVisible = ref(false)
  const allowOpenDeleteConfirm = ref(false)

  const handleDeleteConfirmVisibleChange = (visible: boolean) => {
    // Ignore trigger-originated open (button click/hover). We only open it from Delete action.
    if (visible && !allowOpenDeleteConfirm.value) {
      return
    }
    deleteConfirmVisible.value = visible
    if (!visible) {
      allowOpenDeleteConfirm.value = false
    }
  }

  const handleSelect = (value: string | number | Record<string, unknown> | undefined) => {
    const action = value as MenuAction
    if (action === 'saveSnapshot') {
      if (!props.isSelected) return
      emit('saveSnapshot')
      return
    }
    if (action === 'exportSnapshotJson') {
      if (props.kind === 'live' && !props.isSelected) return
      emit('exportSnapshotJson')
      return
    }
    if (action === 'delete') {
      allowOpenDeleteConfirm.value = true
      deleteConfirmVisible.value = true
    }
  }
</script>

<style lang="less" scoped>
  .menu-button {
    width: 24px;
    height: 24px;
    padding: 0;
    color: var(--gpt-text-secondary);
    border-radius: var(--gpt-radius-sm);

    &:hover {
      color: var(--gpt-brand-900);
      background: var(--gpt-nav-active-bg);
    }
  }

  :deep(.arco-dropdown-open) .menu-button {
    color: var(--brand-color);
    background: var(--gpt-nav-active-bg);
  }

  .menu-button.delete-confirm-open {
    display: inline-flex !important;
    opacity: 1 !important;
    visibility: visible !important;
    pointer-events: auto !important;
    color: var(--brand-color);
    background: var(--gpt-nav-active-bg);
  }
</style>

<style lang="less">
  .dashboard-sidebar-menu-popup {
    z-index: 2000;
  }
</style>
