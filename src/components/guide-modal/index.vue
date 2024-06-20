<template lang="pug">
a-modal.guide-modal(
  v-model:visible="guideModalVisible"
  :mask-closable="false"
  :ok-text="$t('guide.confirm')"
  :hide-cancel="true"
  :closable="false"
  :width="384"
  @ok="handleOk"
)
  template(#title)
    div {{ $t('guide.welcome') }}
    svg.guide-banner
      use(href="#banner")
  a-form(layout="vertical" :model="settingsForm")
    a-form-item(:label="$t('settings.host')")
      a-input(v-model="settingsForm.host")
    a-form-item(:label="$t('settings.database')")
      a-input(v-if="role !== 'admin'" v-model="settingsForm.database")
      a-select(v-else v-model="settingsForm.database" allow-create)
        a-option(
          v-for="item of settingsForm.databaseList"
          :key="item"
          :value="item"
          :label="item"
        )
    a-form-item(:label="$t('settings.username')")
      a-input(v-model="settingsForm.username")
    a-form-item(:label="$t('settings.password')")
      a-input-password(v-model="settingsForm.password" autocomplete="off")

  template(#footer)
</template>

<script lang="ts" setup name="GuideModal">
  import { useAppStore } from '@/store'

  const { username, password, host, database, databaseList, menuSelectedKey, guideModalVisible } = storeToRefs(
    useAppStore()
  )
  const { role } = storeToRefs(useUserStore())

  const { login } = useAppStore()
  const { checkTables } = useDataBaseStore()

  const settingsForm = ref({
    username: username.value,
    password: password.value,
    host: host.value,
    databaseList,
    database: database.value,
  })

  const handleOk = async () => {
    const res = await login(settingsForm.value)
    if (res) {
      checkTables()
    }
  }
</script>
