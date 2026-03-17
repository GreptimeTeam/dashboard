const hasSymbol = typeof Symbol === 'function' && Symbol.for

export const REACT_ELEMENT_TYPE = hasSymbol ? Symbol.for('react.element') : 0xeac7
export const REACT_PORTAL_TYPE = hasSymbol ? Symbol.for('react.portal') : 0xeaca
export const REACT_FRAGMENT_TYPE = hasSymbol ? Symbol.for('react.fragment') : 0xeacb
export const REACT_STRICT_MODE_TYPE = hasSymbol ? Symbol.for('react.strict_mode') : 0xeacc
export const REACT_PROFILER_TYPE = hasSymbol ? Symbol.for('react.profiler') : 0xead2
export const REACT_PROVIDER_TYPE = hasSymbol ? Symbol.for('react.provider') : 0xeacd
export const REACT_CONTEXT_TYPE = hasSymbol ? Symbol.for('react.context') : 0xeace
export const REACT_FORWARD_REF_TYPE = hasSymbol ? Symbol.for('react.forward_ref') : 0xead0
export const REACT_SUSPENSE_TYPE = hasSymbol ? Symbol.for('react.suspense') : 0xead1
export const REACT_SUSPENSE_LIST_TYPE = hasSymbol ? Symbol.for('react.suspense_list') : 0xead8
export const REACT_MEMO_TYPE = hasSymbol ? Symbol.for('react.memo') : 0xead3
export const REACT_LAZY_TYPE = hasSymbol ? Symbol.for('react.lazy') : 0xead4
export const REACT_SCOPE_TYPE = hasSymbol ? Symbol.for('react.scope') : 0xead7

export function typeOf(object: any) {
  if (typeof object === 'object' && object !== null) {
    const { $$typeof } = object
    switch ($$typeof) {
      case REACT_ELEMENT_TYPE: {
        const { type } = object
        switch (type) {
          case REACT_FRAGMENT_TYPE:
          case REACT_PROFILER_TYPE:
          case REACT_STRICT_MODE_TYPE:
          case REACT_SUSPENSE_TYPE:
            return type
          default: {
            const typeOfType = type && type.$$typeof
            switch (typeOfType) {
              case REACT_CONTEXT_TYPE:
              case REACT_FORWARD_REF_TYPE:
              case REACT_PROVIDER_TYPE:
              case REACT_MEMO_TYPE:
              case REACT_LAZY_TYPE:
                return typeOfType
              default:
                return $$typeof
            }
          }
        }
      }
      case REACT_PORTAL_TYPE:
        return $$typeof
      default:
        return $$typeof
    }
  }
  return undefined
}

export const AsyncMode = 0xead5
export const ConcurrentMode = 0xead5
export const ContextConsumer = REACT_CONTEXT_TYPE
export const ContextProvider = REACT_PROVIDER_TYPE
export const Element = REACT_ELEMENT_TYPE
export const ForwardRef = REACT_FORWARD_REF_TYPE
export const Fragment = REACT_FRAGMENT_TYPE
export const Lazy = REACT_LAZY_TYPE
export const Memo = REACT_MEMO_TYPE
export const Portal = REACT_PORTAL_TYPE
export const Profiler = REACT_PROFILER_TYPE
export const StrictMode = REACT_STRICT_MODE_TYPE
export const Suspense = REACT_SUSPENSE_TYPE

export function isValidElementType(type: any) {
  return (
    typeof type === 'string' ||
    typeof type === 'function' ||
    type === REACT_FRAGMENT_TYPE ||
    type === REACT_PROFILER_TYPE ||
    type === REACT_STRICT_MODE_TYPE ||
    type === REACT_SUSPENSE_TYPE ||
    type === REACT_SUSPENSE_LIST_TYPE ||
    (typeof type === 'object' &&
      type !== null &&
      (type.$$typeof === REACT_LAZY_TYPE ||
        type.$$typeof === REACT_MEMO_TYPE ||
        type.$$typeof === REACT_PROVIDER_TYPE ||
        type.$$typeof === REACT_CONTEXT_TYPE ||
        type.$$typeof === REACT_FORWARD_REF_TYPE ||
        type.$$typeof === REACT_SCOPE_TYPE))
  )
}

export function isElement(object: any) {
  return typeof object === 'object' && object !== null && object.$$typeof === REACT_ELEMENT_TYPE
}

export function isFragment(object: any) {
  return typeOf(object) === REACT_FRAGMENT_TYPE
}

export function isMemo(object: any) {
  return typeOf(object) === REACT_MEMO_TYPE
}

export function isLazy(object: any) {
  return typeOf(object) === REACT_LAZY_TYPE
}

export function isForwardRef(object: any) {
  return typeOf(object) === REACT_FORWARD_REF_TYPE
}

export function isContextConsumer(object: any) {
  return typeOf(object) === REACT_CONTEXT_TYPE
}

export function isContextProvider(object: any) {
  return typeOf(object) === REACT_PROVIDER_TYPE
}

export function isPortal(object: any) {
  return typeOf(object) === REACT_PORTAL_TYPE
}

export function isProfiler(object: any) {
  return typeOf(object) === REACT_PROFILER_TYPE
}

export function isStrictMode(object: any) {
  return typeOf(object) === REACT_STRICT_MODE_TYPE
}

export function isSuspense(object: any) {
  return typeOf(object) === REACT_SUSPENSE_TYPE
}
