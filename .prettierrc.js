module.exports = {
  tabWidth: 2,
  semi: false,
  printWidth: 120,
  singleQuote: true,
  quoteProps: 'consistent',
  htmlWhitespaceSensitivity: 'strict',
  vueIndentScriptAndStyle: true,
  plugins: ['@prettier/plugin-pug'],
  pugAttributeSeparator: 'none',
  pugSingleQuote: false,
  pugWrapAttributesThreshold: 3,
  pugSortAttributesBeginning: ['^v-if$', '^v-else$', '^v-else-if$', '^v-for$', '^:key$', '^ref$', '^v-model'],
  pugSortAttributesEnd: ['^:', '^:disabled$', '^@', '^@click'],
  endOfLine: 'auto',
  overrides: [
    {
      files: '*.vue',
      options: {
        pugAttributeSeparator: 'none',
        pugSingleQuote: false,
        pugWrapAttributesThreshold: 3,
        pugSortAttributesBeginning: ['^v-if$', '^v-else$', '^v-else-if$', '^v-for$', '^:key$', '^ref$', '^v-model'],
        pugSortAttributesEnd: ['^:', '^:disabled$', '^@', '^@click'],
        endOfLine: 'auto',
      },
    },
  ],
}
