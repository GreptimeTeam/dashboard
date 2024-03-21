<template lang="pug">
a-layout-header
  TopBar(:disabled="!data.trim()" :loading="false" @submit="submit")
a-layout-content
  a-input(
    v-model="data"
    type="textarea"
    :rows="10"
    :autosize="{ minRows: 10 }"
  )
</template>

<script lang="ts" setup>
  const { writeInfluxDB } = useCodeRunStore()

  const data = ref('')
  const loading = ref(false)

  const submit = async (precision: string) => {
    loading.value = true
    const result = await writeInfluxDB(data.value, precision)
    console.log('result', result)
    if (Reflect.has(result, 'error')) {
      // error
    } else {
      // success

      data.value = ''
    }
    loading.value = false
  }

  onMounted(() => {
    console.log('mounted write')
  })
  onActivated(() => {
    console.log('activated write')
  })
</script>
