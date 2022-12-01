/**
 * If you use the template method for development, you can use the unplugin-vue-components plugin to enable on-demand loading support.
 * https://github.com/antfu/unplugin-vue-components
 * https://arco.design/vue/docs/start
 * Although the Pro project is full of imported components, this plugin will be used by default.
 */
import Components from 'unplugin-vue-components/vite'
import { ArcoResolver } from 'unplugin-vue-components/resolvers'

export default function configArcoResolverPlugin() {
  const arcoResolverPlugin = Components({
    dirs: [], // Avoid parsing src/components.
    deep: false,
    resolvers: [ArcoResolver()],
  })
  return arcoResolverPlugin
}
