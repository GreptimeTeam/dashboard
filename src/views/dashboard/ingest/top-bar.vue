<template lang="pug">
a-space.top-bar
  a-button(type="primary" @click="submit") Submit
  a-select(v-model="precision" style="width: 200px" :options="precisionOptions")
    template(#title)
    span Precision
</template>

<script lang="ts" setup name="TopBar">
  // TODO: use same precision for both pages
  const precision = ref('ms')

  onMounted(() => {
    console.log('mounted top bar')
  })
  onActivated(() => {
    console.log('activated  top bar')
  })
  const submit = () => {
    console.log('submit')
  }

  const precisionOptions = [
    {
      value: 'ns',
      label: 'Nanoseconds',
    },
    {
      value: 'us',
      label: 'Microseconds',
    },
    {
      value: 'ms',
      label: 'Milliseconds',
    },
    {
      value: 's',
      label: 'Seconds',
    },
  ]
</script>

<style lang="less" scoped>
  .top-bar {
    display: flex;
    justify-content: space-between;
    padding-bottom: 20px;
    background: var(--card-bg-color);
  }
</style>
