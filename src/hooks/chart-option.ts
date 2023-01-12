import { computed } from 'vue'
import { EChartsOption } from 'echarts'
import { useAppStore } from '@/store'

// for code hints
// import { SeriesOption } from 'echarts';
// Because there are so many configuration items, this provides a relatively convenient code hint.
// When using vue, pay attention to the reactive issues. It is necessary to ensure that corresponding functions can be triggered, TypeScript does not report errors, and code writing is convenient.
interface optionsFn {
  (isDark: boolean): EChartsOption
}

export default function useChartOption(sourceOption: optionsFn) {
  const appStore = useAppStore()
  const isDark = computed(() => {
    return appStore.theme === 'dark'
  })

  const chartOption = computed<EChartsOption>(() => {
    return sourceOption(isDark.value)
  })
  return {
    chartOption,
  }
}
