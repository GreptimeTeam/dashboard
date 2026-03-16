<template lang="pug">
iframe.perses-dashboard-iframe(ref="dashboardIframe" :src="iframeSrc" @load="onIframeLoad")
</template>

<script lang="ts" setup name="PersesDashboardIframe">
  import type { PersesDashboardFile } from '@/perses-dashboard/react/WorkbenchProvider'

  interface SavePayload {
    dashboardJSON: unknown
    name: string
    commitId?: string
  }

  interface Props {
    name: string
    file: PersesDashboardFile | null | undefined
    dashboardEditable?: boolean
    database?: string
    username?: string
    password?: string
    authHeader?: string
    instance?: string
    onSave?: (payload: SavePayload) => Promise<void>
  }

  const props = withDefaults(defineProps<Props>(), {
    dashboardEditable: false,
    database: undefined,
    username: undefined,
    password: undefined,
    authHeader: undefined,
    instance: undefined,
    onSave: undefined,
  })

  const appStore = useAppStore()

  const dashboardIframe = ref<HTMLIFrameElement | null>(null)

  const iframeSrc = computed(() => `${import.meta.env.BASE_URL}dashboard.html?name=${props.name}`)

  const createEmptyDashboard = () => {
    const dashboardName = props.name.split('.')[0] || 'empty-dashboard'
    return {
      kind: 'Dashboard',
      metadata: {
        name: dashboardName,
        project: 'default',
        version: 0,
      },
      spec: {
        display: {
          name: dashboardName,
        },
        duration: '1h',
        refreshInterval: '30s',
        variables: [],
        layouts: [],
        panels: {},
      },
    }
  }

  const sendDashboardData = () => {
    if (dashboardIframe.value && dashboardIframe.value.contentWindow) {
      let fileData = props.file
      if (!fileData || !fileData.content || fileData.content.trim() === '') {
        const emptyDashboard = createEmptyDashboard()
        fileData = {
          content: JSON.stringify(emptyDashboard),
          filename: props.name || 'empty-dashboard.json',
          meta: props.file?.meta,
        }
      }

      const dashboardData = JSON.parse(
        JSON.stringify({
          database: props.database ?? appStore.database,
          username: props.username ?? appStore.username,
          password: props.password ?? appStore.password,
          authHeader: props.authHeader ?? appStore.authHeader ?? 'Authorization',
          name: props.name,
          file: fileData,
          instance: props.instance ?? '',
          dashboardEditable: props.dashboardEditable,
        })
      )

      dashboardIframe.value.contentWindow.postMessage(
        {
          type: 'update-dashboard',
          data: dashboardData,
        },
        '*'
      )
    }
  }

  const onIframeLoad = () => {
    sendDashboardData()
  }

  watch(
    [
      () => appStore.database,
      () => appStore.username,
      () => appStore.password,
      () => appStore.authHeader,
      () => props.name,
      () => props.file,
      () => props.dashboardEditable,
      () => props.database,
      () => props.username,
      () => props.password,
      () => props.authHeader,
      () => props.instance,
    ],
    () => {
      sendDashboardData()
    },
    { deep: true }
  )

  const handleMessage = async (event: MessageEvent) => {
    if (event.data.type === 'dashboard-iframe-ready') {
      if (event.source === dashboardIframe.value?.contentWindow) {
        sendDashboardData()
      }
      return
    }

    if (event.data.type === 'save-dashboard-request') {
      const { requestId, data } = event.data
      const requestFileName = data.name || props.name
      if (requestFileName !== props.name) return

      try {
        if (!props.onSave) {
          throw new Error('onSave is not provided')
        }

        const payload: SavePayload = {
          dashboardJSON: data.dashboardJSON,
          name: data.name || props.name,
          commitId: data.commitId || '',
        }

        await props.onSave(payload)

        if (dashboardIframe.value?.contentWindow) {
          dashboardIframe.value.contentWindow.postMessage(
            {
              type: 'save-dashboard-response',
              requestId,
              success: true,
            },
            '*'
          )
        }
      } catch (error) {
        if (dashboardIframe.value?.contentWindow) {
          dashboardIframe.value.contentWindow.postMessage(
            {
              type: 'save-dashboard-response',
              requestId,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            },
            '*'
          )
        }
      }
    }
  }

  onMounted(() => {
    window.addEventListener('message', handleMessage)
  })

  onUnmounted(() => {
    if (dashboardIframe.value) {
      dashboardIframe.value.src = 'about:blank'
    }

    window.removeEventListener('message', handleMessage)
  })

  defineExpose({
    sendDashboardData,
  })
</script>

<style lang="less" scoped>
  .perses-dashboard-iframe {
    width: 100%;
    height: 100%;
    border: none;
  }
</style>
