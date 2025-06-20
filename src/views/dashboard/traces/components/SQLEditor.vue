<template lang="pug">
.sql-editor-container
  CodeMirror(
    :model-value="modelValue"
    :style="{ height: editorHeight }"
    :extensions="extensions"
    :spellcheck="true"
    :autofocus="true"
    :indent-with-tab="true"
    :tabSize="2"
    :placeholder="placeholder"
    @update:model-value="$emit('update:modelValue', $event)"
  )
</template>

<script setup name="SQLEditor" lang="ts">
  import { Codemirror as CodeMirror } from 'vue-codemirror'
  import { basicSetup } from 'codemirror'
  import { sql as sqlLang } from '@codemirror/lang-sql'

  interface Props {
    modelValue: string
    editorHeight?: string
    placeholder?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    editorHeight: '140px',
    placeholder: 'Enter your SQL query here...',
  })

  const emit = defineEmits<{
    'update:modelValue': [value: string]
  }>()

  const extensions = [basicSetup, sqlLang()]

  // Format SQL function
  function formatSQL() {
    if (!props.modelValue.trim()) return

    try {
      let sql = props.modelValue.trim()

      // Remove extra whitespace and normalize
      sql = sql.replace(/\s+/g, ' ')

      // Add line breaks before major keywords
      sql = sql.replace(
        /\b(SELECT|FROM|WHERE|AND|OR|ORDER\s+BY|GROUP\s+BY|HAVING|LIMIT|OFFSET|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|FULL\s+OUTER\s+JOIN|UNION|UNION\s+ALL)\b/gi,
        '\n$1'
      )

      // Add line breaks after SELECT fields (commas)
      sql = sql.replace(/,(?=\s*\w)/g, ',\n')

      // Add line breaks after parentheses in certain contexts
      sql = sql.replace(/\(\s*/g, '(\n')
      sql = sql.replace(/\s*\)/g, '\n)')

      // Clean up multiple line breaks
      sql = sql.replace(/\n\s*\n/g, '\n')

      // Split into lines for indentation
      const lines = sql
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      let indentLevel = 0
      const formattedLines = []

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        const upperLine = line.toUpperCase()

        // Decrease indent for closing parentheses
        if (line === ')') {
          indentLevel = Math.max(0, indentLevel - 1)
        }

        // Calculate current line indent
        let currentIndent = indentLevel

        // Special indentation rules
        if (upperLine.startsWith('SELECT')) {
          currentIndent = 0
        } else if (upperLine.startsWith('FROM')) {
          currentIndent = 0
        } else if (upperLine.startsWith('WHERE')) {
          currentIndent = 0
        } else if (upperLine.startsWith('AND') || upperLine.startsWith('OR')) {
          currentIndent = 1
        } else if (
          upperLine.startsWith('ORDER BY') ||
          upperLine.startsWith('GROUP BY') ||
          upperLine.startsWith('HAVING')
        ) {
          currentIndent = 0
        } else if (upperLine.startsWith('LIMIT') || upperLine.startsWith('OFFSET')) {
          currentIndent = 0
        } else if (upperLine.includes('JOIN')) {
          currentIndent = 0
        } else if (line.startsWith(',')) {
          currentIndent = 1
        } else if (upperLine.match(/^(TRACE_ID|SERVICE_NAME|SPAN_NAME|TIMESTAMP|DURATION_NANO|\w+)/)) {
          // Field names in SELECT
          if (i > 0 && lines[i - 1].toUpperCase().includes('SELECT')) {
            currentIndent = 1
          }
        }

        // Add proper spacing and indentation
        const indentedLine = '  '.repeat(currentIndent) + line
        formattedLines.push(indentedLine)

        // Increase indent for opening parentheses
        if (line === '(') {
          indentLevel += 1
        }
      }

      // Join lines and clean up
      let formatted = formattedLines.join('\n')

      // Clean up extra spaces around operators

      // Clean up AS keyword spacing
      formatted = formatted.replace(/\s+AS\s+/gi, ' AS ')

      // Fix comma spacing in SELECT
      formatted = formatted.replace(/,\s*\n\s*/g, ',\n  ')

      // Ensure proper case for keywords
      const keywords = [
        'SELECT',
        'FROM',
        'WHERE',
        'AND',
        'OR',
        'ORDER BY',
        'GROUP BY',
        'HAVING',
        'LIMIT',
        'OFFSET',
        'AS',
        'JOIN',
        'LEFT JOIN',
        'RIGHT JOIN',
        'INNER JOIN',
        'ON',
        'COUNT',
        'SUM',
        'AVG',
        'MAX',
        'MIN',
        'DISTINCT',
      ]
      keywords.forEach((keyword) => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
        formatted = formatted.replace(regex, keyword)
      })

      emit('update:modelValue', formatted)
    } catch (error) {
      console.error('Failed to format SQL:', error)
    }
  }

  // Expose formatSQL method to parent
  defineExpose({
    formatSQL,
  })
</script>

<style lang="less" scoped>
  .sql-editor-container {
    display: flex;
    flex-direction: column;
  }

  :deep(.cm-editor) {
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  :deep(.cm-editor.cm-focused) {
    outline: 0;
  }
</style>
