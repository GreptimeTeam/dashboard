import { sql } from '@codemirror/lang-sql'
import { python } from '@codemirror/lang-python'
import { PromQLExtension } from '@prometheus-io/codemirror-promql'
import { java } from '@codemirror/lang-java'
import { rust } from '@codemirror/lang-rust'
import { StreamLanguage } from '@codemirror/language'
import { go } from '@codemirror/legacy-modes/mode/go'
import { javascript } from '@codemirror/legacy-modes/mode/javascript'
import { shell } from '@codemirror/legacy-modes/mode/shell'

const mapLanguages = (value: string): any => {
  const mappedLanguages: any = {
    python,
    java,
    rust,
    sql,
    javascript: () => StreamLanguage.define(javascript),
    go: () => StreamLanguage.define(go),
    bash: () => StreamLanguage.define(shell),
    promql: () => new PromQLExtension().asExtension(),
  }
  return mappedLanguages[value.toLowerCase()] || mapLanguages('bash')
}

export default mapLanguages
