import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import editorAPI from '@/api/editor'
import requestTableSchema, {
  requestTableSchemas,
  type TableSchemaColumn,
  type TableSchemaScope,
} from '@/api/table-schema-fetch'
import { SEMANTIC_TYPE_MAP } from '@/views/dashboard/config'
import { sql } from '@codemirror/lang-sql'
import { PromQLExtension } from '@prometheus-io/codemirror-promql'
import useAppStore from '../app'
import { ScriptTreeData, TableDetail, TableTreeChild, TableTreeParent } from './types'
import buildTableNodes from './table-nodes'
import { RecordsType, SchemaType } from '../code-run/types'

const useDataBaseStore = defineStore('database', () => {
  const { database } = storeToRefs(useAppStore())
  const scriptsData = ref()
  // shallowRef: nodes stay plain objects (no per-node reactive proxies), which
  // halves the memory of the 50k-node page. Every mutation must replace `.value`
  // (see setTree) so consumers (a-tree, originTablesTree) still update.
  const tablesTreeForDatabase = shallowRef({} as { [key: string]: TableTreeParent[] })
  const setTree = (db: string, nodes: TableTreeParent[]) => {
    tablesTreeForDatabase.value = { ...tablesTreeForDatabase.value, [db]: nodes }
  }
  const tablesTotalByDatabase = ref<Record<string, number>>({})
  /**
   * Upper bound of rows kept in memory for the sidebar tree. One request
   * loads this page; callers paginate / search beyond it instead of loading
   * millions of nodes into the reactive tree.
   */
  const MAX_TABLES_PER_PAGE = 50_000
  const tablesPageByDatabase = ref<Record<string, { offset: number; loaded: number; filter: string }>>({})
  /** Latest table page/search request; older responses are ignored. */
  let tablePageRequestId = 0
  /** Names-only cache for callers that do not need the full tree (show tables). */
  const tableNamesByDatabase = new Map<string, string[]>()
  const originTablesTree = computed(() => {
    return tablesTreeForDatabase.value[database.value] || []
  })
  const tablesLoading = ref(false)
  const totalTablesLoading = ref(false)
  const scriptsLoading = ref(false)
  const databaseActiveKeys = ref<string[]>(['public'])

  const hints = computed(() => {
    const schema: { [key: string]: string[] } = {}
    const initialMetricList = new Set<string>()
    originTablesTree.value.forEach((item: TableTreeParent) => {
      const columns = item.columns.map((child: TableTreeChild) => {
        initialMetricList.add(child.title)
        return child.title
      })
      schema[item.title] = columns
      initialMetricList.add(item.title)
    })

    return { sql: { schema }, promql: initialMetricList }
  })

  const extensions = ref<{
    sql: any[]
    promql: any[]
  }>({
    sql: [sql(hints.value.sql)],
    promql: [new PromQLExtension().asExtension()],
  })

  // NOTE(perf): this watcher used to rebuild the editor extensions on every table-tree
  // mutation (`hints` is invalidated by each page push / column load). Building them is
  // eager: `sql({ schema })` pre-builds the full completion tree via completeFromSchema,
  // which costs O(tables × columns) — ~0.2s at 10k tables, ~8.6s and tens of MB at 100k.
  // The old `getTables` loop loaded 2000-row pages, so the watcher ran once per page and made
  // sidebar loading O(pages × tables) of main-thread blocking (measured ~24s tree rebuild
  // + minutes of extension rebuilds at 100k tables).
  //
  // It is also dead work today: `editor.vue` snapshots `extensions` into a plain array at
  // setup time, so rebuilt extensions never reach the already-mounted editor. Disabled
  // until autocomplete is reimplemented as an on-demand completion source (query
  // information_schema on input, or complete only expanded/recent tables). The initial
  // value above is kept so the editor still gets SQL/PromQL language support.
  // TODO(query-perf): replace with a lazy CompletionSource instead of re-enabling this.

  const getIndexesForColumns = (columnSchemas: SchemaType[]) => {
    const columnNameIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'column_name'
    })
    const dataTypeIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'greptime_data_type' || schema.name === 'data_type'
    })

    const semanticTypeIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'semantic_type'
    })

    const tableTypeIndex = columnSchemas.findIndex((schema: SchemaType) => {
      return schema.name === 'table_type'
    })

    return { columnNameIndex, dataTypeIndex, semanticTypeIndex, tableTypeIndex }
  }

  const generateTreeChildren = (nodeData: TableTreeParent, rows: string[][], indexes: { [key: string]: number }) => {
    const treeChildren: TableTreeChild[] = []
    const columnNames: string[] = []
    const { semanticTypeIndex, columnNameIndex, dataTypeIndex } = indexes

    let timeIndexName = '%TIMESTAMP%'

    rows.forEach((row: string[]) => {
      const iconType = SEMANTIC_TYPE_MAP[row[semanticTypeIndex]]
      if (iconType === 'TIMESTAMP') {
        timeIndexName = row[columnNameIndex]
      }
      treeChildren.push({
        title: row[columnNameIndex],
        key: `${nodeData.title}.${row[columnNameIndex]}`,
        isLeaf: true,
        dataType: row[dataTypeIndex],
        iconType,
        parentKey: nodeData.key,
      })
      columnNames.push(row[columnNameIndex])
    })
    return {
      treeChildren,
      timeIndexName,
      columnNames,
    }
  }

  const getOriginTablesTree = (tempTablesData: RecordsType, db: string) => {
    // Replace (not append): callers load one page at a time. Assigning also avoids
    // `push(...100k)`, which exceeds the engine's argument-count limit.
    setTree(db, buildTableNodes(tempTablesData, 0))
  }

  const addChildren = (
    key: number,
    children: TableTreeChild[] | TableDetail[],
    timeIndexName: string,
    type: string,
    isSilent?: boolean,
    specifiedDB?: string,
    expectedTitle?: string
  ) => {
    const db = specifiedDB || database.value
    const nodes = tablesTreeForDatabase.value[db] || []
    const node = nodes[key]
    if (!node) return
    // Keys are page-local indexes: drop responses that arrive after the user
    // paged away, otherwise they would be applied to a different table.
    if (expectedTitle && node.title !== expectedTitle) return
    if (!isSilent) {
      node.children = children
    }
    node.timeIndexName = timeIndexName
    if (type === 'details') {
      node.details = children as TableDetail[]
    } else {
      node.columns = children as TableTreeChild[]
    }
    // shallowRef: new array identity so a-tree and computeds re-render.
    setTree(db, nodes.slice())
  }

  const originScriptsList = computed(() => {
    const tempArray: ScriptTreeData[] = []
    if (scriptsData.value) {
      const columnSchemas: SchemaType[] = scriptsData.value.output[0].records.schema?.column_schemas || []
      const scriptNameIndex = columnSchemas.findIndex((schema: SchemaType) => {
        return schema.name === 'name'
      })
      const scriptCodeIndex = columnSchemas.findIndex((schema: SchemaType) => {
        return schema.name === 'script'
      })
      scriptsData.value.output[0].records.rows.forEach((item: Array<string>) => {
        const node: ScriptTreeData = {
          title: item[scriptNameIndex],
          key: item[scriptNameIndex],
          code: item[scriptCodeIndex],
          isLeaf: true,
          children: [],
        }
        tempArray.push(node)
      })
    }

    return tempArray
  })

  const getTablesCount = async (db?: string) => {
    try {
      const res: any = await editorAPI.fetchTablesCount(db)
      const count: number = res.output[0].records.rows[0][0]
      return count
    } catch {
      return 0
    }
  }

  async function getTables(specifiedDB?: string, offset = 0) {
    tablePageRequestId += 1
    const requestId = tablePageRequestId
    tablesLoading.value = true
    totalTablesLoading.value = true
    const db = specifiedDB || database.value
    try {
      // Count and page in parallel: the page request does not need the total.
      const totalPromise = getTablesCount(db)
      const res: any = await editorAPI.getTables(MAX_TABLES_PER_PAGE, offset, db)
      // A newer page/search request superseded this one; drop the response.
      if (requestId !== tablePageRequestId) return
      const records = res?.output?.[0]?.records
      // Replace only after the response arrives, so the old page stays visible
      // (no white flash) while a slow page request is in flight.
      getOriginTablesTree(records, db)
      tablesPageByDatabase.value = {
        ...tablesPageByDatabase.value,
        [db]: { offset, loaded: records?.rows?.length || 0, filter: '' },
      }
      const total = await totalPromise
      if (requestId !== tablePageRequestId) return
      tablesTotalByDatabase.value = { ...tablesTotalByDatabase.value, [db]: total }
    } catch (error) {
      console.error('[database] failed to load table page', error)
    } finally {
      if (requestId === tablePageRequestId) {
        tablesLoading.value = false
        totalTablesLoading.value = false
      }
    }
  }

  /**
   * Server-side table search, also capped at MAX_TABLES_PER_PAGE rows so the
   * reactive tree never grows past the memory budget. `tablesTotalByDatabase`
   * keeps the database total so the sidebar can show "matches / total".
   */
  async function searchTables(specifiedDB: string | undefined, keyword: string, offset = 0) {
    tablePageRequestId += 1
    const requestId = tablePageRequestId
    const db = specifiedDB || database.value
    const trimmed = keyword.trim()
    tablesLoading.value = true
    try {
      const res: any = await editorAPI.getTables(MAX_TABLES_PER_PAGE, offset, db, trimmed)
      if (requestId !== tablePageRequestId) return
      const records = res?.output?.[0]?.records
      getOriginTablesTree(records, db)
      tablesPageByDatabase.value = {
        ...tablesPageByDatabase.value,
        [db]: { offset, loaded: records?.rows?.length || 0, filter: trimmed },
      }
    } catch (error) {
      console.error('[database] failed to search tables', error)
    } finally {
      if (requestId === tablePageRequestId) tablesLoading.value = false
    }
  }

  async function getTableByName(tableName: any, db?: string) {
    try {
      const res: any = await editorAPI.getTableByName(tableName, db)
      return res.output[0].records
    } catch (error) {
      return false
    }
  }

  async function getScriptsTable() {
    const { updateDataStatus } = useUserStore()
    updateDataStatus('scripts', true)
    scriptsLoading.value = true
    try {
      const res: any = await editorAPI.checkScriptsTable()
      if (res.output[0].records.rows[0][0] === 0) {
        scriptsData.value = null
      } else {
        try {
          const scripts = await editorAPI.getScriptsTable()
          scriptsData.value = scripts
        } catch (error) {
          scriptsData.value = null
        }
      }
    } catch (error) {
      scriptsData.value = null
    }
    scriptsLoading.value = false
  }

  const resetData = () => {
    tablePageRequestId += 1
    tableNamesByDatabase.clear()
    const db = database.value
    setTree(db, [])
    if (db) {
      const { [db]: _removed, ...rest } = tablesTotalByDatabase.value
      tablesTotalByDatabase.value = rest
    }
    scriptsData.value = null
  }

  /**
   * Plain table names for one database.
   *
   * Uses a single `show tables` (one request, no tree nodes) instead of the
   * paged `information_schema` full load: at 100k tables that is ~1 request
   * rather than 50, and it avoids materialising 100k tree nodes in the store.
   */
  const tableNamesInflight = new Map<string, Promise<string[]>>()
  async function getTableNames(specifiedDB?: string): Promise<string[]> {
    const db = specifiedDB || database.value
    const cached = tableNamesByDatabase.get(db)
    if (cached) return cached

    const inflight = tableNamesInflight.get(db)
    if (inflight) return inflight

    const request = (async () => {
      const res: any = await editorAPI.runSQL('show tables', db)
      const rows = res?.output?.[0]?.records?.rows || []
      const names = rows.map((row: Array<string>) => row[0]).filter(Boolean)
      tableNamesByDatabase.set(db, names)
      return names
    })()
    tableNamesInflight.set(db, request)
    try {
      return await request
    } finally {
      tableNamesInflight.delete(db)
    }
  }

  return {
    tablesTreeForDatabase,
    tablesTotalByDatabase,
    tablesPageByDatabase,
    MAX_TABLES_PER_PAGE,
    originTablesTree,
    originScriptsList,
    tablesLoading,
    totalTablesLoading,
    scriptsLoading,
    scriptsData,
    hints,
    extensions,
    databaseActiveKeys,
    getTables,
    searchTables,
    getTableNames,
    addChildren,
    getTableByName,
    getScriptsTable,
    resetData,
    generateTreeChildren,
    getIndexesForColumns,
  }
})

export default useDataBaseStore
