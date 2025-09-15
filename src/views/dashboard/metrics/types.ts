import type { Ref } from 'vue'
import type { useSeries } from '@/hooks/use-series'

// Define the metrics context type that combines seriesHook with custom fields
export interface MetricsContext extends ReturnType<typeof useSeries> {
  // Custom fields
  chartType: Ref<string>
  stepSelectionType: Ref<string>
  handleTimeRangeUpdate: (newTimeRange: [number, number]) => void
  updateQueryParams: () => void
}
