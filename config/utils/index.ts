/**
 * Whether to generate package preview
 */
export default {}

export function isReportMode(): boolean {
  return process.env.REPORT === 'true'
}
