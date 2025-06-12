<template lang="pug">
router-view(v-slot="{ Component }")
  keep-alive
    component(:is="Component")
</template>
