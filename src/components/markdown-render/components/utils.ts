import { javascript } from '@codemirror/lang-javascript'
import { sql } from '@codemirror/lang-sql'
import { python } from '@codemirror/lang-python'
import { PromQLExtension } from '@prometheus-io/codemirror-promql'
import { java } from '@codemirror/lang-java'
import { rust } from '@codemirror/lang-rust'
import { StreamLanguage } from '@codemirror/language'
import { go } from '@codemirror/legacy-modes/mode/go'
import { shell } from '@codemirror/legacy-modes/mode/shell'

const mapLanguages = (value: string): any => {
  const mappedLanguages: any = {
    javascript,
    python,
    java,
    rust,
    sql,
    go: () => StreamLanguage.define(go),
    bash: () => StreamLanguage.define(shell),
    promql: () => new PromQLExtension().asExtension(),
  }
  return mappedLanguages[value.toLowerCase()] || mapLanguages('bash')
}

export default mapLanguages
