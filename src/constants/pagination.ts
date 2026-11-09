/**
 * Shared page size for the Table Query and Metrics Query sidebars.
 *
 * 10k balances:
 * - tree rebuild on expand (~100ms instead of ~0.5s at 50k),
 * - bounded memory for the virtual tree,
 * - a manageable page count at 100k/1M rows.
 */
const TABLE_PAGE_SIZE = 10_000

export default TABLE_PAGE_SIZE
