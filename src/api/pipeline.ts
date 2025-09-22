import axios from 'axios'
import qs from 'qs'
import dayjs from 'dayjs'
import editorAPI from './editor'

const { runSQL } = editorAPI
const url = '/v1/events/pipelines'
const sqlUrl = `/v1/sql`
const pipelineLogsUrl = '/v1/events/logs'

const makeSqlData = (sql: string) => {
  return qs.stringify({
    sql,
  })
}

export type PipeFile = {
  name: string
  content?: string
  version: string
}

/* eslint-disable */
function nanoTimestampToUTCString(nanoTimestamp: bigint) {
  nanoTimestamp = BigInt(nanoTimestamp)
  const divide1 = BigInt(1000000000)
  const seconds = nanoTimestamp / divide1 // na to s
  const divide2 = BigInt(1000000)
  const milliseconds = Number((nanoTimestamp % divide1) / divide2) // ms
  const nanoseconds = Number(nanoTimestamp % divide2)

  const date = new Date(Number(seconds) * 1000)
  const isoString = date.toISOString().replace('Z', '').replace('.000', '')
  return `${isoString}.${String(milliseconds).padStart(3, '0')}${String(nanoseconds).padStart(6, '0')}Z`
}

/* eslint-enable */
export function create(pipeFile: PipeFile) {
  const appStore = useAppStore()
  const { content, name } = pipeFile
  const file = new File([content], `${name}.yaml`, {
    type: 'application/yaml',
  })
  const formData = new FormData()
  formData.append('file', file)
  return axios.postForm(`${url}/${name}?db=${appStore.database}`, formData)
}

export function list() {
  return runSQL(
    `SELECT name,max(created_at) as created_at FROM greptime_private.pipelines group by name order by created_at desc`
  ).then((result) => {
    return result.output[0].records.rows.map((row: any) => {
      return {
        name: row[0],
        version: nanoTimestampToUTCString(row[1]),
      }
    })
  })
}

export const postPipelineLogs = (
  db: string,
  table: string,
  pipelineName: string,
  data: string,
  contentType = 'application/x-ndjson'
) => {
  return axios.post(pipelineLogsUrl, data, {
    params: {
      db,
      table,
      pipeline_name: pipelineName,
    },
    headers: {
      'Content-Type': contentType,
    },
  })
}

export function getByName(name: string): Promise<PipeFile> {
  const sql = `select name, created_at, pipeline 
    from greptime_private.pipelines 
    where name = '${name}'
    order by created_at desc 
    limit 1`
  return runSQL(sql).then((result) => {
    const row = result.output[0].records.rows[0] as any
    return {
      name: row[0],
      version: nanoTimestampToUTCString(row[1]),
      content: row[2],
    }
  })
}

export function del(name: string, version: string) {
  const appStore = useAppStore()
  return axios.delete(`${url}/${name}`, {
    params: {
      db: appStore.database,
      version,
    },
  })
}

export function debug(name: string, content: any) {
  const appStore = useAppStore()
  return axios.post(`${url}/dryrun?pipeline_name=${name}&db=${appStore.database}`, JSON.parse(content), {
    headers: {
      'Content-Type': 'application/json', // Set Content-Type
    },
  })
}

export function debugContent(pipeline: string, data: any, contentType: string) {
  const appStore = useAppStore()
  return axios.post(
    `${url}/dryrun?&db=${appStore.database}`,
    {
      data,
      pipeline,
      data_type: contentType,
    },
    {
      headers: {
        'Content-Type': 'application/json', // Set Content-Type
      },
    }
  )
}

export function getPipelineDDL(pipelineName: string, tableName: string) {
  const appStore = useAppStore()
  return axios
    .get(`/v1/pipelines/${pipelineName}/ddl`, {
      params: {
        table: tableName,
        db: appStore.database,
      },
    })
    .then((result) => {
      return result.sql.sql
    })
}
