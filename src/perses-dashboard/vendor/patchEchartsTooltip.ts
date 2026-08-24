import type { Plugin } from 'vite'

/**
 * ECharts 5.5 TooltipHTMLContent can throw after dispose when axis tooltips
 * still call getSize / moveTo. Mirror the null guards from echarts 5.6+.
 */
const PATCHES: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern:
      /TooltipHTMLContent\.prototype\.getSize = function \(\) \{\s*var el = this\.el;\s*return \[el\.offsetWidth, el\.offsetHeight\];\s*\};/,
    replacement: `TooltipHTMLContent.prototype.getSize = function () {
    var el = this.el;
    return el ? [el.offsetWidth, el.offsetHeight] : [0, 0];
  };`,
  },
  {
    pattern: /TooltipHTMLContent\.prototype\.moveTo = function \(zrX, zrY\) \{\s*var styleCoord = this\._styleCoord;/,
    replacement: `TooltipHTMLContent.prototype.moveTo = function (zrX, zrY) {
    if (!this.el) {
      return;
    }
    var styleCoord = this._styleCoord;`,
  },
  {
    pattern:
      /TooltipHTMLContent\.prototype\.hide = function \(\) \{\s*var _this = this;\s*var style = this\.el\.style;/,
    replacement: `TooltipHTMLContent.prototype.hide = function () {
    var _this = this;
    if (!this.el) {
      this._show = false;
      return;
    }
    var style = this.el.style;`,
  },
  {
    pattern:
      /TooltipHTMLContent\.prototype\.dispose = function \(\) \{\s*clearTimeout\(this\._hideTimeout\);\s*clearTimeout\(this\._longHideTimeout\);\s*var parentNode = this\.el\.parentNode;\s*parentNode && parentNode\.removeChild\(this\.el\);\s*this\.el = this\._container = null;\s*\};/,
    replacement: `TooltipHTMLContent.prototype.dispose = function () {
    clearTimeout(this._hideTimeout);
    clearTimeout(this._longHideTimeout);
    if (this.el) {
      var parentNode = this.el.parentNode;
      parentNode && parentNode.removeChild(this.el);
    }
    this.el = this._container = null;
  };`,
  },
]

function patchTooltipSource(code: string): string | null {
  let next = code
  let changed = false
  for (const { pattern, replacement } of PATCHES) {
    if (!pattern.test(next)) {
      continue
    }
    next = next.replace(pattern, replacement)
    changed = true
  }
  return changed ? next : null
}

/** Guard ECharts 5.5 tooltip DOM access when the node was already disposed. */
export function patchEchartsTooltipGetSize(): Plugin {
  return {
    name: 'patch-echarts-tooltip-get-size',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('TooltipHTMLContent')) {
        return null
      }
      const patched = patchTooltipSource(code)
      if (!patched) {
        return null
      }
      return {
        code: patched,
        map: null,
      }
    },
  }
}

/** Mirror the Vite patch during optimizeDeps pre-bundling. */
export function patchEchartsTooltipGetSizeEsbuild() {
  return {
    name: 'patch-echarts-tooltip-get-size-esbuild',
    setup(build: {
      onLoad: (
        opts: { filter: RegExp },
        cb: (args: { path: string }) => Promise<{ contents: string; loader: 'js' } | null>
      ) => void
    }) {
      build.onLoad({ filter: /TooltipHTMLContent\.js$/ }, async (args) => {
        const { readFile } = await import('node:fs/promises')
        const contents = await readFile(args.path, 'utf8')
        const patched = patchTooltipSource(contents)
        if (!patched) {
          return null
        }
        return { contents: patched, loader: 'js' }
      })
    },
  }
}
