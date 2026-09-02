import { mergeConfig } from 'vite'
import eslint from 'vite-plugin-eslint'
import baseConfig from './vite.config.base'

export default mergeConfig(
  {
    mode: 'development',
    plugins: [
      eslint({
        cache: false,
        include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.vue'],
        exclude: ['node_modules'],
        // Default failOnError:true aborts transform on lint errors → broken HMR / white screen
        // until the next save. Keep reporting errors without blocking the dev server.
        failOnError: false,
        failOnWarning: false,
      }),
    ],
  },
  baseConfig
)
