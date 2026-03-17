const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref')
const REACT_MEMO_TYPE = Symbol.for('react.memo')

const REACT_STATICS: Record<string, boolean> = {
  childContextTypes: true,
  contextType: true,
  contextTypes: true,
  defaultProps: true,
  displayName: true,
  getDefaultProps: true,
  getDerivedStateFromError: true,
  getDerivedStateFromProps: true,
  mixins: true,
  propTypes: true,
  type: true,
}

const KNOWN_STATICS: Record<string, boolean> = {
  name: true,
  length: true,
  prototype: true,
  caller: true,
  callee: true,
  arguments: true,
  arity: true,
}

const FORWARD_REF_STATICS: Record<string, boolean> = {
  $$typeof: true,
  render: true,
  defaultProps: true,
  displayName: true,
  propTypes: true,
}

const MEMO_STATICS: Record<string, boolean> = {
  $$typeof: true,
  compare: true,
  defaultProps: true,
  displayName: true,
  propTypes: true,
  type: true,
}

const TYPE_STATICS: Record<string, Record<string, boolean>> = {}
TYPE_STATICS[REACT_FORWARD_REF_TYPE as unknown as string] = FORWARD_REF_STATICS

function getStatics(component: any): Record<string, boolean> {
  if (component && component.$$typeof === REACT_MEMO_TYPE) {
    return MEMO_STATICS
  }
  return TYPE_STATICS[component?.['$$typeof']] || REACT_STATICS
}

const defineProperty = Object.defineProperty
const getOwnPropertyNames = Object.getOwnPropertyNames
const getOwnPropertySymbols = Object.getOwnPropertySymbols
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const getPrototypeOf = Object.getPrototypeOf
const objectPrototype = Object.prototype

export default function hoistNonReactStatics(
  targetComponent: any,
  sourceComponent: any,
  blacklist?: Record<string, boolean>
) {
  if (typeof sourceComponent !== 'string') {
    if (objectPrototype) {
      const inheritedComponent = getPrototypeOf(sourceComponent)
      if (inheritedComponent && inheritedComponent !== objectPrototype) {
        hoistNonReactStatics(targetComponent, inheritedComponent, blacklist)
      }
    }

    let keys: Array<string | symbol> = getOwnPropertyNames(sourceComponent)

    if (getOwnPropertySymbols) {
      keys = keys.concat(getOwnPropertySymbols(sourceComponent))
    }

    const targetStatics = getStatics(targetComponent)
    const sourceStatics = getStatics(sourceComponent)

    for (let i = 0; i < keys.length; ++i) {
      const key = keys[i] as string
      if (
        !KNOWN_STATICS[key] &&
        !(blacklist && blacklist[key]) &&
        !(sourceStatics && sourceStatics[key]) &&
        !(targetStatics && targetStatics[key])
      ) {
        const descriptor = getOwnPropertyDescriptor(sourceComponent, key)
        try {
          defineProperty(targetComponent, key, descriptor as PropertyDescriptor)
        } catch {
          // ignore read-only properties
        }
      }
    }
  }

  return targetComponent
}
